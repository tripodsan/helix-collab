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
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

import { toBase64, fromBase64 } from 'lib0/buffer';

import * as Y from 'yjs';
import { GoneException } from '@aws-sdk/client-apigatewaymanagementapi';
import { SharedDocument } from './shared-document.js';

const messageSync = 0;
const messageAwareness = 1;

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
   *
   * @oaram {String} connectionId
   * @param {String} docName
   * @returns {Promise<SharedDocument>}
   */
  async getOrCreateDoc(connectionId, docName) {
    const doc = await this.#storage.getOrCreateDoc(docName);

    // convert updates to an encoded array
    const updates = doc.updates.map(
      (update) => new Uint8Array(Buffer.from(update, 'base64')),
    );

    const sdoc = new SharedDocument()
      .withName(docName)
      .withStorage(this.#storage)
      .withConnectionId(connectionId);

    // apply updates before init listeners
    for (const update of updates) {
      try {
        Y.applyUpdate(sdoc, update);
      } catch (ex) {
        console.log('Something went wrong with applying the update');
      }
    }

    sdoc.on('update', async (update, origin, doc) => {
      console.log('update', update, origin, doc.name);
    });
    sdoc.on('destroy', (doc) => {
      console.log('YDoc destroyed', doc.name);
    });

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
   * @returns {Promise<void>}
   */
  async onSyncMessage(decoder, encoder, doc) {
    const messageType = decoding.readVarUint(decoder);
    switch (messageType) {
      case syncProtocol.messageYjsSyncStep1:
        syncProtocol.writeSyncStep2(
          encoder,
          doc,
          decoding.readVarUint8Array(decoder),
        );
        break;
      case syncProtocol.messageYjsSyncStep2:
      case syncProtocol.messageYjsUpdate: {
        console.log(`applying update to doc ${doc.name}`);
        const update = decoding.readVarUint8Array(decoder);
        Y.applyUpdate(doc, update);
        await this.#storage.updateDoc(doc.name, toBase64(update));
        // await this.broadcast(docName, connectionId, messageArray);
        break;
      }
      default:
        throw new Error('Unknown message type');
    }
  }

  /**
   * handles new connection
   * @param {string} connectionId
   * @param {string} docName
   * @returns {Promise<void>}
   */
  async onConnection(connectionId, docName) {
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
    console.log(`${connectionId} connected`);
  }

  /**
   * handles disconnect
   * @param {string} connectionId
   * @returns {Promise<void>}
   */
  async onDisconnect(connectionId) {
    await this.#storage.removeConnection(connectionId);
    console.log(`${connectionId} disconnected`);
  }

  /**
   * handles message
   * @param {String} connectionId
   * @param {String} b64Message
   * @param {function} send Send callback
   * @returns {Promise<void>}
   */
  async onMessage(connectionId, b64Message) {
    const messageArray = fromBase64(b64Message);

    const docName = (await this.#storage.getConnection(connectionId))?.docName;
    if (!docName) {
      throw Error(`no connection for ${connectionId}`);
    }
    const doc = await this.getOrCreateDoc(connectionId, docName);

    const encoder = encoding.createEncoder();
    const decoder = decoding.createDecoder(messageArray);
    const messageCat = decoding.readVarUint(decoder);

    switch (messageCat) {
      // Case sync1: Read SyncStep1 message and reply with SyncStep2
      //             (send doc to client wrt state vector input)
      // Case sync2 or yjsUpdate: Read and apply Structs and then DeleteStore to a y instance
      //             (append to db, send to all clients)
      case messageSync: {
        encoding.writeVarUint(encoder, messageSync);
        await this.onSyncMessage(decoder, encoder, doc);
        if (encoding.length(encoder) > 1) {
          await this.#sendCB(connectionId, toBase64(encoding.toUint8Array(encoder)));
        }
        break;
      }
      case messageAwareness: {
        await this.broadcast(docName, connectionId, messageArray);
        break;
      }
      default:
        throw new Error('Unknown message category.');
    }
  }
}
