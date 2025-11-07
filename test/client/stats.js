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
import { readFile } from 'node:fs/promises';

async function run() {
  const data = (await readFile('logs.json', 'utf-8'))
    .split('\n')
    .filter((s) => !!s);

  const funcs = {};
  const conn = {};
  const cache = {
    connection: {
      miss: 0,
      hit: 0,
    },
    index: {
      miss: 0,
      hit: 0,
      stale: 0,
    },
  };
  let nr = 0;

  for (const row of data) {
    const s = JSON.parse(row);
    if (s.message === 'LOG_USAGE') {
      let f = funcs[s.id];
      if (!f) {
        f = {
          // eslint-disable-next-line no-plusplus
          nr: nr++,
          count: 0,
          connections: {},
        };
        funcs[s.id] = f;
      }
      f.count += 1;
      const act = `num_${s.a}`;
      f[act] = (f[act] || 0) + 1;
      f.connections[s.cid] = (f.connections[s.cid] || 0) + 1;

      let c = conn[s.cid];
      if (!c) {
        c = {
          functions: {},
          docs: {},
        };
        conn[s.cid] = c;
      }
      c.functions[nr] = (c.functions[nr] || 0) + 1;
      c.docs[s.d] = (c.docs[s.d] || 0) + 1;
    }
    if (s.message === 'LOG_CACHE') {
      cache[s.c][s.t] += 1;
    }
  }
  for (const f of Object.values(funcs)) {
    f.connections = Object.keys(f.connections).length;
  }
  for (const f of Object.values(conn)) {
    f.functions = Object.keys(f.functions).length;
    f.docs = JSON.stringify(f.docs);
  }
  console.log('Functions: %d', Object.keys(funcs).length);
  console.table(funcs);
  console.log('Connections: %d', Object.keys(conn).length);
  console.table(conn);
  const actions = {
    count: 0,
    num_connect: 0,
    'num_message-0': 0,
    'num_message-1': 0,
    num_disconnect: 0,
  };
  for (const f of Object.values(funcs)) {
    for (const k of Object.keys(actions)) {
      if (f[k]) {
        actions[k] += f[k];
      }
    }
  }
  console.table(actions);
  console.log('Connection cache stats:');
  console.table(cache.connection);
  console.log('Index cache stats:');
  console.table(cache.index);
}

run().catch(console.error);
