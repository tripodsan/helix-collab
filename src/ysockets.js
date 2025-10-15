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
import { Connections } from './connections.js';

const messageSync = 0;
const messageAwareness = 1;

export class YSockets {
  con = new Connections();

  destroy() {
    this.con.destroy();
  }

  /**
   * handles new connection
   * @param {string} connectionId
   * @param {string} docName
   * @returns {Promise<void>}
   */
  async onConnection(connectionId, docName, send) {
    const { con } = this;
    await con.addConnection(connectionId, docName);
    const doc = await con.getOrCreateYDoc(docName);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);

    // TODO: cannot send message during connection...invoke async to trigger send
    try {
      await send(connectionId, toBase64(encoding.toUint8Array(encoder)));
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
    const { con } = this;
    await con.removeConnection(connectionId);

    console.log(`${connectionId} disconnected`);
  }

  /**
   * handles message
   * @param {String} connectionId
   * @param {String} b64Message
   * @param {function} send Send callback
   * @returns {Promise<void>}
   */
  async onMessage(connectionId, b64Message, send) {
    const { con } = this;
    const messageArray = fromBase64(b64Message);

    const docName = (await con.getConnection(connectionId))?.docName;
    if (!docName) {
      throw Error(`no connection for ${connectionId}`);
    }
    const connectionIds = await con.getConnectionIds(docName);
    const otherConnectionIds = connectionIds.filter(
      (id) => id !== connectionId,
    );

    /**
     * Broadcast message
     * @param message
     * @returns {Promise<Awaited<unknown>[]>}
     */
    const broadcast = (message) => Promise.all(
      otherConnectionIds.map(async (id) => {
        try {
          await send(id, toBase64(message));
        } catch (e) {
          // remove connections that no longer exist
          if (e instanceof GoneException) {
            await con.removeConnection(id);
          }
        }
      }),
    );

    const doc = await con.getOrCreateYDoc(docName);

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
            const update = decoding.readVarUint8Array(decoder);
            Y.applyUpdate(doc, update);
            await con.updateDoc(docName, toBase64(update));
            await broadcast(messageArray);
            break;
          }
          default:
            throw new Error('Unknown message type');
        }

        if (encoding.length(encoder) > 1) {
          await send(connectionId, toBase64(encoding.toUint8Array(encoder)));
        }
        break;
      }
      case messageAwareness: {
        await broadcast(messageArray);
        break;
      }
      default:
        throw new Error('Unknown message category.');
    }
  }
}
