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
import { SharedDocument } from './shared-document.js';

const messageSync = 0;
const messageAwareness = 1;

export const INSTANCE_ID = randomUUID();
function logUsage(connectionId, docName, action) {
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
   * Store incremental updates
   * @type {boolean}
   */
  #incremental = true;

  /**
   * internal promise that is resolved when the doc is updated
   * @type {null}
   */
  #updatePromise = null;

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
   * waits until the document is updated.
   * @returns {Promise<null>}
   */
  async updated() {
    return this.#updatePromise;
  }

  /**
   * stores the updated doc in storage and broadcasts the update/
   * @param {Uint8Array} update
   * @param {?} origin
   * @param {Y.doc} doc
   * @returns {Promise<void>}
   */
  async onUpdateBroadcast(update, origin, doc) {
    trace('onUpdateBroadcast() - init');
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);
    await this.broadcast(doc.name, doc.connectionId, message);
    trace('onUpdateBroadcast() - done');
  }

  /**
   * stores the updated doc in storage and broadcasts the update/
   * @param {Uint8Array} update
   * @param {?} origin
   * @param {Y.doc} doc
   * @returns {Promise<void>}
   */
  async onUpdateStore(update, origin, doc) {
    trace('onUpdateStore() - init');
    // this is a bit awkward. but if the ydoc triggers the update, we want to wait until
    // the storage is updated before the lambda ends
    let done = null;
    this.#updatePromise = new Promise((resolve) => {
      done = resolve;
    });
    try {
      if (origin === this) {
        console.log('update self');
      }
      if (this.#incremental) {
        await this.#storage.updateDoc(doc.name, 'updates', Buffer.from(update));
      } else {
        const state = Y.encodeStateAsUpdate(doc);
        await this.#storage.storeDoc(doc.name, 'state', Buffer.from(state));
      }
    } finally {
      trace('onUpdateStore() - done');
      done();
      this.updatePromise = null;
    }
  }

  /**
   *
   * @oaram {String} connectionId
   * @param {String} docName
   * @returns {Promise<SharedDocument>}
   */
  async getOrCreateDoc(connectionId, docName) {
    trace('getOrCreate() - init');
    const doc = this.#incremental
      ? await this.#storage.getOrCreateDoc(docName, 'updates', [])
      : await this.#storage.getOrCreateDoc(docName, 'state', Buffer.alloc(0));

    const sdoc = new SharedDocument()
      .withName(docName)
      .withStorage(this.#storage)
      .withConnectionId(connectionId);

    trace('getOrCreate() - apply doc updates');

    // apply update before init listeners
    try {
      if (this.#incremental) {
        for (const update of doc.updates) {
          Y.applyUpdate(sdoc, update);
        }
      } else if (doc.state.length > 0) {
        Y.applyUpdate(sdoc, doc.state);
      }
    } catch (e) {
      console.log('Something went wrong with applying the update', e);
    }

    sdoc.on('update', this.onUpdateBroadcast.bind(this));
    sdoc.on('update', this.onUpdateStore.bind(this));

    sdoc.init();

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
          if (e instanceof GoneException) {
            await this.#storage.removeConnection(id);
          }
        }
      });
    return Promise.all(tasks);
  }

  /**
   * Handls the sync message received from client
   * @param decoder
   * @param encoder
   * @param doc
   * @param transactionOrigin
   */
  // eslint-disable-next-line class-methods-use-this
  onSyncMessage(decoder, encoder, doc, transactionOrigin) {
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
        syncProtocol.readUpdate(decoder, doc, transactionOrigin);
        break;
      }
      default:
        throw new Error('Unknown message type');
    }
    trace('onSyncMessage() - done');
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
    logUsage(connectionId, '', 'disconnect');
    await this.#storage.removeConnection(connectionId);
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
    logUsage(connectionId, docName, `message-${messageCat}`);
    if (!docName) {
      throw Error(`no connection for ${connectionId}`);
    }
    switch (messageCat) {
      case messageSync: {
        const doc = await this.getOrCreateDoc(connectionId, docName);
        encoding.writeVarUint(encoder, messageSync);
        this.onSyncMessage(decoder, encoder, doc);
        if (encoding.length(encoder) > 1) {
          trace('onMessage() - reply sync message');
          await this.#sendCB(connectionId, toBase64(encoding.toUint8Array(encoder)));
        }
        await this.updated();
        trace('onMessage() - done sync message');
        break;
      }
      case messageAwareness: {
        await this.broadcast(docName, connectionId, message);
        break;
      }
      default:
        throw new Error('Unknown message category.');
    }
  }
}
