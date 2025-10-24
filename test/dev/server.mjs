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

const wss = new WebSocketServer({ port: 8080 });
const connectedClients = [];

const storage = new Storage(new LocalPersistence('./tmp'));

const send = async (id, b64Message) => {
  if (connectedClients[id]) {
    console.log('[%d] send %s', id, b64Message);
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
  const id = connectedClients.length;
  connectedClients.push(ws);
  console.log('[%d] New connection to document "%s"', id, docName);
  await ysockets.onConnection(id, docName);

  ws.on('error', console.error);

  ws.on('message', async (message) => {
    console.log('[%d] recv %s', id, message);
    await ysockets.onMessage(id, message.toString());
  });

  ws.on('close', async () => {
    await ysockets.onDisconnect(id);
    connectedClients.splice(id, 1);
    console.log('[%d] Disconnected', id);
  });
});

wss.on('close', async (...args) => {
  console.log('Disconnected', args);
});


console.log('Listening on ws://localhost:5000');
