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
import { INSTANCE_ID, trace } from './ysockets.js';

const CON_TABLE_NAME = 'helix-test-collab-v0-connections';
const DOC_TABLE_NAME = 'helix-test-collab-v0-docs';
const DEBOUNCE_TABLE_NAME = 'helix-collab-debounce';

export function logCache(cache, type) {
  console.info({
    message: 'LOG_CACHE',
    id: INSTANCE_ID,
    c: cache,
    t: type,
  });
}

/**
 * Global in-memory connection cache
 * @type {Map<any, any>}
 */
const ConnectionCache = new Map();

/**
 * Global in-memory connections by document cache
 * @type {Map<any, any>}
 */
const ConnectionsByDocCache = new Map();

/**
 * Caches a connection item
 * @param {ConnectionItem} connectionItem
 */
function cacheConnection(connectionItem) {
  const { id, docName } = connectionItem;
  ConnectionCache.set(id, connectionItem);
  let conns = ConnectionsByDocCache.get(docName);
  if (!conns) {
    conns = {
      ids: new Set(),
      // remember when the cache was last refreshed from the DB
      lastRefreshed: Date.now(),
    };
    ConnectionsByDocCache.set(docName, conns);
  }
  conns.ids.add(id);
}

/**
 * Removes a connection item from the cache
 * @param id
 */
function removeConnectionCache(id) {
  const item = ConnectionCache.get(id);
  if (item) {
    ConnectionCache.delete(id);
    const conns = ConnectionsByDocCache.get(item.docName);
    if (conns) {
      conns.ids.delete(id);
    }
  }
}

/**
 * @typedef ConnectionItem
 * @property {string} id
 * @property {string} docName
 * @property {string} created
*/

/**
 * @typedef DocumentItem
 * @property {string} docName
 * @property {string[]} updates
 * @property {number} lastModified
 */

export class Storage {
  /**
   * @type DDBPersistence
   */
  #ps;

  /**
   * @type DocPersistence
   */
  #dps;

  /**
   * @type DebounceQueue
   */
  #dq;

  /**
   * @type string
   */
  #docTableName;

  /**
   * @type string
   */
  #conTableName;

  /**
   * @type string
   */
  #debounceTableName;

  /**
   * Delay in seconds before persisting document after last update
   * @type {number}
   */
  #persistDelay = 5;

  /**
   * Timeout in seconds for persisting document changes
   * @type {number}
   */
  #persistTimeout = 10;

  /**
   * @param {DDBPersistence} persistence
   */
  constructor() {
    this.#docTableName = DOC_TABLE_NAME;
    this.#conTableName = CON_TABLE_NAME;
    this.#debounceTableName = DEBOUNCE_TABLE_NAME;
  }

  withPersistence(persistence) {
    this.#ps = persistence;
    return this;
  }

  withDocPersistence(docPersistence) {
    this.#dps = docPersistence;
    return this;
  }

  withDebounceQueue(value) {
    this.#dq = value;
    return this;
  }

  destroy() {
    this.#ps?.destroy();
    this.#dq?.destroy();
    this.#dps?.destroy();
  }

  /**
   *
   * @param {string} id
   * @param {string} docName
   * @returns {Promise<boolean>}
   */
  async addConnection(id, docName) {
    const item = {
      id,
      docName,
      created: new Date().toISOString(),
    };
    // note quite correct to update the connection in the cache, but we don't care about the
    // created time in the cache (yet)
    cacheConnection(item);
    return this.#ps.createItem(this.#conTableName, item);
  }

  /**
   *
   * @param id
   * @returns {Promise<ConnectionItem>}
   */
  async getConnection(id) {
    let item = ConnectionCache.get(id);
    if (!item) {
      item = await this.#ps.getItem(this.#conTableName, 'id', id);
      if (item) {
        logCache('connection', 'miss');
        cacheConnection(item);
      }
    } else {
      logCache('connection', 'hit');
    }
    return item;
  }

  /**
   *
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async removeConnection(id) {
    removeConnectionCache(id);
    return this.#ps.removeItem(this.#conTableName, 'id', id);
  }

  /**
   *
   * @param {string} docName
   * @returns {Promise<string[]>}
   */
  async getConnectionIds(docName) {
    let conns = ConnectionsByDocCache.get(docName);
    if (!conns) {
      logCache('index', 'miss');
      conns = {
        ids: new Set(),
        lastRefreshed: Date.now(),
      };
      ConnectionsByDocCache.set(docName, conns);
    } else {
      const now = Date.now();
      if ((now - conns.lastRefreshed) < 5000) {
        logCache('index', 'hit');
        return Array.from(conns.ids);
      } else {
        logCache('index', 'stale');
      }
      conns.lastRefreshed = now;
    }
    const ret = await this.#ps
      .listItems(this.#conTableName, 'docName', docName, 'docName-index');
    const ids = ret.map(({ id }) => id) ?? [];
    // update the cache
    ids.forEach((id) => conns.ids.add(id));
    return ids;
  }

  /**
   * @param {string} docName
   * @returns {Promise<DocumentItem>}
   */
  async getDoc(docName) {
    return this.#ps.getItem(this.#docTableName, 'docName', docName);
  }

  /**
   * @param docName
   * @returns {Promise<boolean>}
   */
  async removeDoc(docName) {
    return this.#ps.removeItem(this.#docTableName, 'docName', docName);
  }

  /**
   *
   * @param {String} docName
   * @param attrName
   * @param attrValue
   * @returns {Promise<DocumentItem>}
   */
  async getOrCreateDoc(docName, attrName, attrValue) {
    return this.#ps.getOrCreateItem(this.#docTableName, 'docName', docName, attrName, attrValue);
  }

  /**
   *
   * @param {string} docName
   * @param attrName
   * @param attrValue
   * @returns {Promise<DocumentItem>}
   */
  async updateDoc(docName, attrName, attrValue) {
    return this.#ps.appendItemValue(this.#docTableName, 'docName', docName, attrName, attrValue);
  }

  /**
   * @param {string} docName
   * @param attrName
   * @param attrValue
   * @returns {Promise<DocumentItem>}
   */
  async storeDoc(docName, attrName, attrValue) {
    return this.#ps.updateItem(this.#docTableName, 'docName', docName, attrName, attrValue);
  }

  async debounceUpdate(docName) {
    const attrs = await this.#ps.touchDebounce(this.#debounceTableName, 'docName', docName, this.#persistDelay);
    if (attrs) {
      await this.#dq.dispatch(docName, attrs.expireAt, attrs.requestTime);
    }
  }

  async isUpdateDebounced(docName) {
    const ret = await this.#ps.checkDebounce(this.#debounceTableName, 'docName', docName, this.#persistTimeout);
    return !ret;
  }

  /**
   * persists the document state to the persistence layer
   * @param {SharedDocument} doc
   * @returns {Promise<void>}
   */
  async persistDocument(doc) {
    console.log('[debounce] converting document...', doc.name);
    const content = doc.toAEM();
    console.log('[debounce] persist', doc.name, content);
    trace('persistDocument(%s) - %d bytes', doc.name, content.length);
    await this.#dps.saveDoc(doc.name, content);
  }
}
