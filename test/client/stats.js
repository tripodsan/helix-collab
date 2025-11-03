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

  for (const row of data) {
    const s = JSON.parse(row);
    let f = funcs[s.id];
    if (!f) {
      f = {
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
      };
      conn[s.cid] = c;
    }
    c.functions[s.id] = (c.functions[s.id] || 0) + 1;
  }
  for (const f of Object.values(funcs)) {
    f.connections = Object.keys(f.connections).length;
  }
  console.table(funcs);
  console.table(conn);
  console.log('  Functions: %d', Object.keys(funcs).length);
  console.log('Connections: %d', Object.keys(conn).length);
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
}

run().catch(console.error);
