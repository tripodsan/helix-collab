/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* eslint-env mocha */
import assert from 'node:assert';
import { Connections } from '../src/connections.js';

describe('db test', () => {
  /**
   * @type Connections
   */
  let con;

  beforeEach(() => {
    con = new Connections();
  });

  afterEach((() => {
    con.destroy();
  }));

  it('can add, get and remove a connection', async () => {
    const ret1 = await con.addConnection('test-id', 'test-doc');
    assert.strictEqual(ret1, true);

    const ret2 = await con.getConnection('test-id');
    assert.deepStrictEqual(ret2, {
      id: 'test-id',
      docName: 'test-doc',
    });

    const ret3 = await con.removeConnection('test-id');
    assert.strictEqual(ret3, true);

    const ret4 = await con.getConnection('test-id');
    assert.strictEqual(ret4, null);
  });

  it('can find the existing connections', async () => {
    await con.addConnection('test-id-1', 'test-doc');
    await con.addConnection('test-id-2', 'test-doc');

    const ret = await con.getConnectionIds('test-doc');
    ret.sort();
    assert.deepStrictEqual(ret, ['test-id-1', 'test-id-2']);

    await con.removeConnection('test-id-1');
    await con.removeConnection('test-id-2');
  });

  it('creates a new doc', async () => {
    await con.removeDoc('test-doc');
    assert.strictEqual(await con.getDoc('test-doc'), null);

    let ret = await con.getOrCreateDoc('test-doc');
    assert.deepStrictEqual(ret, {
      docName: 'test-doc',
      updates: [],
    });

    ret = await con.getDoc('test-doc');
    assert.deepStrictEqual(ret, {
      docName: 'test-doc',
      updates: [],
    });
  });

  it('updates a doc', async () => {
    await con.removeDoc('test-doc');
    await con.getOrCreateDoc('test-doc');

    let ret = await con.updateDoc('test-doc', 'update-1');
    assert.strictEqual(ret, true);

    ret = await con.getDoc('test-doc');
    assert.deepStrictEqual(ret, {
      docName: 'test-doc',
      updates: ['update-1'],
    });
  });
});
