/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import { randomUUID } from 'node:crypto';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

import { toBase64, fromBase64 } from 'lib0/buffer';

import * as Y from 'yjs';
import { GoneException } from '@aws-sdk/client-apigatewaymanagementapi';
import { SharedDocument } from './doc/shared-document.js';

const messageSync = 0;
const messageAwareness = 1;

export const INSTANCE_ID = randomUUID();
export function logUsage(connectionId, docName, action) {
  console.info({
    message: 'LOG_USAGE',
    id: INSTANCE_ID,
    cid: connectionId,
    d: docName,
    a: action,
  });
}

const ENABLE_TRACE = false;
let traceCounter = 0;
export function trace(msg) {
  if (ENABLE_TRACE) {
    // eslint-disable-next-line no-plusplus
    console.log('[%s][%d] TRACE: %s', INSTANCE_ID, traceCounter++, msg);
  }
}

export class YSockets {
  /**
   * @type Storage
   */
  #storage;

  /**
   * @type function
   */
  #sendCB;

  /**
   * @param {Storage} storage
   * @returns {YSockets}
   */
  constructor(storage, sendCB) {
    this.#storage = storage;
    this.#sendCB = sendCB;
  }

  destroy() {
    this.#storage.destroy();
  }

  /**
   * stores the updated doc in storage
   * @param {SharedDocument} doc
   * @param {Uint8Array} update
   * @returns {Promise<void>}
   */
  async onUpdateStore(doc, update) {
    trace('onUpdateStore() - init');
    try {
      const buf = Buffer.from(update);
      if (doc.diskSize + buf.length > 10_000) {
        console.log('doc %s exceeded size limit with %d bytes, switching to full state saves', doc.name, doc.diskSize + buf.length);
        await this.#storage.removeDoc(doc.name);
        const state = Y.encodeStateAsUpdate(doc);
        await this.#storage.storeDocState(doc.name, Buffer.from(state));
      } else {
        await this.#storage.updateDoc(doc.name, 'updates', Buffer.from(update));
      }

      // we can't really debounce in AWS lambda, as the function might end right away.
      // so we track the debounce time in the debounce table and send an SQS to persist later.
      await this.#storage.debounceUpdate(doc.name);
    } finally {
      trace('onUpdateStore() - done');
    }
  }

  /**
   * handles the debounce update
   * @param {string} docName
   * @returns {Promise<void>}
   */
  async onDebounceUpdate(docName) {
    console.log('[debounce] update request received for %s', docName);
    trace('onDebounceUpdate() - init');
    if (!await this.#storage.isUpdateDebounced(docName)) {
      console.log('[debounce] doc still bouncing %s', docName);
      return;
    }
    console.log('[debounce] doc debounced %s', docName);
    const doc = await this.getOrCreateDoc('', docName);
    await this.#storage.persistDocument(doc);
  }

  /**
   *
   * @oaram {String} connectionId
   * @param {String} docName
   * @returns {Promise<SharedDocument>}
   */
  async getOrCreateDoc(connectionId, docName) {
    trace('getOrCreate() - init');
    const doc = await this.#storage.getOrCreateDoc(docName, 'updates', []);
    const state = await this.#storage.loadDocState(docName);
    if (state) {
      doc.updates.unshift(state);
    }

    const sdoc = new SharedDocument()
      .withName(docName)
      .withConnectionId(connectionId);

    trace('getOrCreate() - apply doc updates');

    try {
      let size = state ? -state.length : 0;
      for (const update of doc.updates) {
        size += update.length;
        Y.applyUpdate(sdoc, update);
      }
      sdoc.diskSize = size;
      console.log('applied %d updates (%d bytes) to doc %s', doc.updates.length, size, docName);
    } catch (e) {
      console.log('Something went wrong with applying the update', e);
    }

    trace('getOrCreate() - done');
    return sdoc;
  }

  /**
   * Broadcast message
   * @param message
   * @returns {Promise<Awaited<unknown>[]>}
   */
  async broadcast(docName, myId, message) {
    const msg = toBase64(message);
    const ids = await this.#storage.getConnectionIds(docName);
    const tasks = ids
      .filter((id) => id !== myId)
      .map(async (id) => {
        try {
          await this.#sendCB(id, msg);
        } catch (e) {
          // remove connections that no longer exist
          if (e instanceof GoneException || e.message.startsWith('no connection for %s', id)) {
            await this.#storage.removeConnection(id);
          }
        }
      });
    return Promise.all(tasks);
  }

  /**
   * Handle the sync message received from client
   * @param decoder
   * @param encoder
   * @param doc
   * @param transactionOrigin
   * @return {Promise<number>}
   */
  async onSyncMessage(decoder, encoder, doc, transactionOrigin) {
    trace('onSyncMessage() - init');
    const messageType = decoding.readVarUint(decoder);
    // console.log('onSyncMessage ', messageType);
    switch (messageType) {
      case syncProtocol.messageYjsSyncStep1:
        syncProtocol.readSyncStep1(decoder, encoder, doc);
        break;
      case syncProtocol.messageYjsSyncStep2:
        // console.log(`applying sync step2 to doc ${doc.name}`);
        syncProtocol.readSyncStep2(decoder, doc, transactionOrigin);
        break;
      case syncProtocol.messageYjsUpdate: {
        // console.log(`applying update to doc ${doc.name}`);
        const update = decoding.readVarUint8Array(decoder);
        try {
          Y.applyUpdate(doc, update, transactionOrigin);
        } catch (error) {
          console.error('Caught error while handling a Yjs update', error);
        }
        await this.onUpdateStore(doc, update);
        break;
      }
      default:
        throw new Error('Unknown message type');
    }
    trace('onSyncMessage() - done');
    return messageType;
  }

  /**
   * handles new connection
   * @param {string} connectionId
   * @param {string} docName
   * @returns {Promise<void>}
   */
  async onConnection(connectionId, docName) {
    logUsage(connectionId, docName, 'connect');
    await this.#storage.addConnection(connectionId, docName);
    const doc = await this.getOrCreateDoc(connectionId, docName);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);

    try {
      await this.#sendCB(connectionId, toBase64(encoding.toUint8Array(encoder)));
    } catch (e) {
      console.error('error during send', e);
    }
    console.log(`[${connectionId}] connected`);
  }

  /**
   * handles disconnect
   * @param {string} connectionId
   * @returns {Promise<void>}
   */
  async onDisconnect(connectionId) {
    const item = await this.#storage.removeConnection(connectionId);
    logUsage(connectionId, item?.docName, 'disconnect');
    console.log(`[${connectionId}] disconnected`);
  }

  /**
   * handles message
   * @param {String} connectionId
   * @param {String} b64Message
   * @param {function} send Send callback
   * @returns {Promise<void>}
   */
  async onMessage(connectionId, b64Message) {
    trace('onMessage() - init');
    const message = fromBase64(b64Message);
    const encoder = encoding.createEncoder();
    const decoder = decoding.createDecoder(message);
    const messageCat = decoding.readVarUint(decoder);

    const docName = (await this.#storage.getConnection(connectionId))?.docName;
    if (!docName) {
      throw Error(`no connection for ${connectionId}`);
    }
    switch (messageCat) {
      case messageSync: {
        const doc = await this.getOrCreateDoc(connectionId, docName);
        encoding.writeVarUint(encoder, messageSync);
        const type = await this.onSyncMessage(decoder, encoder, doc, null);
        await this.broadcast(docName, connectionId, message);
        logUsage(connectionId, docName, `message-0-${type}`);
        if (encoding.length(encoder) > 1) {
          trace('onMessage() - reply sync message');
          await this.#sendCB(connectionId, toBase64(encoding.toUint8Array(encoder)));
        }
        trace('onMessage() - done sync message');
        break;
      }
      case messageAwareness: {
        logUsage(connectionId, docName, 'message-1');
        await this.broadcast(docName, connectionId, message);
        break;
      }
      default:
        throw new Error('Unknown message category.');
    }
  }
}
