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
import { WebSocketServer } from 'ws';
import { Storage } from '../../src/storage.js';
import { YSockets } from '../../src/ysockets.js';
import { LocalPersistence } from './local-db.js';
import { DDBPersistence } from '../../src/ddb-persistence.js';
import { DocPersistenceS3 } from '../../src/doc-persistence-s3.js';

const wss = new WebSocketServer({ port: 8080 });
console.log('Listening on ws://localhost:8080');

let nextId = 0;
const connectedClients = { };

// const storage = new Storage(new LocalPersistence('./tmp'));
const storage = new Storage(new DDBPersistence(), new DocPersistenceS3());

const send = async (id, b64Message) => {
  if (connectedClients[id]) {
    // console.log('[%d]< %s', id, b64Message);
    connectedClients[id].send(b64Message);
  }
};

const ysockets = new YSockets(storage, send);

function getDocName(params) {
  const doc = params.get('doc');
  if (!doc) {
    throw new Error('missing "doc" query parameter.');
  }
  return doc;
}

wss.on('connection', async (ws, req) => {
  const url = new URL(`wss://localhost:8080${req.url}`);
  const docName = getDocName(url.searchParams);
  const id = String(nextId);
  nextId += 1;
  connectedClients[id] = ws;

  ws.on('error', console.error);

  ws.on('message', async (message) => {
    // console.log('[%d]> %s', id, message);
    try {
      await ysockets.onMessage(id, message.toString());
    } catch (e) {
      console.error('error: ', id, e);
    }
  });

  ws.on('close', async () => {
    await ysockets.onDisconnect(id);
    delete connectedClients[id];
    console.log('[%d] Disconnected', id);
  });

  console.log('[%d] New connection to document "%s"', id, docName);
  await ysockets.onConnection(id, docName);
  console.log('[%d] New connection to document "%s" complete', id, docName);
});
