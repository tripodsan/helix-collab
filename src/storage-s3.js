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

import { HelixStorage } from '@adobe/helix-shared-storage';
import { logCache } from './storage.js';

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
      lastRefreshed: 0,
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

function getDocKey(docName) {
  return `/helix-collab/docs/${docName}.json`.replaceAll(/\/+/g, '/');
}

/**
 * Converts the document item from base64 encoding to Buffer
 * @param {DocumentItem} item
 */
function fromBase64(item) {
  for (const [k, v] of Object.entries(item)) {
    if (k === 'state') {
      // eslint-disable-next-line no-param-reassign
      item[k] = Buffer.from(v, 'base64');
    } else if (k === 'updates' && Array.isArray(v)) {
      v.forEach((e, i) => {
        v[i] = Buffer.from(e, 'base64');
      });
    }
  }
  return item;
}

/**
 * Converts attribute to base64 encoding
 * @param attr
 * @returns {*|string}
 */
function toBase64(attr) {
  if (attr instanceof Buffer) {
    return attr.toString('base64');
  } else if (Array.isArray(attr)) {
    return attr.map((e) => toBase64(e));
  }
  return attr;
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
 */

export class StorageS3 {
  /**
   * @type {HelixStorage}
   */
  #sharedStorage;

  /**
   * @type {Bucket}
   */
  #bucket;

  /**
   * @type {string}
   */
  #bucketId = 'helix-tier3-test-bucket';

  /**
   */
  constructor() {
    this.#sharedStorage = new HelixStorage({
      disableR2: true,
    });
    this.#bucket = this.#sharedStorage.bucket(this.#bucketId, true);
  }

  destroy() {
    this.#sharedStorage.close();
  }

  async #loadConnections() {
    const data = await this.#bucket.get('/helix-collab/connections.json');
    if (data) {
      return JSON.parse(data);
    }
    return {};
  }

  async #saveConnections(cons) {
    await this.#bucket.put(
      '/helix-collab/connections.json',
      JSON.stringify(cons),
      'application/json',
    );
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
    // not quite correct to update the connection in the cache, but we don't care about the
    // created time in the cache (yet)
    cacheConnection(item);
    const cons = await this.#loadConnections();
    cons[id] = item;
    await this.#saveConnections(cons);
    return item;
  }

  /**
   *
   * @param id
   * @returns {Promise<ConnectionItem>}
   */
  async getConnection(id) {
    let item = ConnectionCache.get(id);
    if (!item) {
      const cons = await this.#loadConnections();
      item = cons[id];
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
    const cons = await this.#loadConnections();
    if (cons[id]) {
      delete cons[id];
      await this.#saveConnections(cons);
      return true;
    }
    return false;
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
    const ret = await this.#loadConnections();
    const ids = Object.values(ret).map(({ id }) => id) ?? [];
    // update the cache
    ids.forEach((id) => conns.ids.add(id));
    return ids;
  }

  /**
   * @param {string} docName
   * @returns {Promise<DocumentItem>}
   */
  async getDoc(docName) {
    const data = await this.#bucket.get(getDocKey(docName));
    if (data) {
      return fromBase64(JSON.parse(data));
    }
    return null;
  }

  /**
   * @param docName
   * @returns {Promise<boolean>}
   */
  async removeDoc(docName) {
    await this.#bucket.remove(getDocKey(docName));
  }

  /**
   *
   * @param {String} docName
   * @param attrName
   * @param attrValue
   * @returns {Promise<DocumentItem>}
   */
  async getOrCreateDoc(docName, attrName, attrValue) {
    const data = await this.#bucket.get(getDocKey(docName));
    if (data) {
      return fromBase64(JSON.parse(data));
    }
    return {
      name: docName,
      [attrName]: attrValue,
    };
  }

  /**
   *
   * @param {string} docName
   * @param attrName
   * @param attrValue
   * @returns {Promise<boolean>}
   */
  async updateDoc(docName, attrName, attrValue) {
    // eslint-disable-next-line no-param-reassign
    attrValue = toBase64(attrValue);
    let doc;
    const data = await this.#bucket.get(getDocKey(docName));
    if (!data) {
      doc = {
        name: docName,
        [attrName]: [attrValue],
      };
    } else {
      doc = JSON.parse(data);
      doc[attrName].push(attrValue);
    }
    await this.#bucket.put(getDocKey(docName), JSON.stringify(doc), 'application/json');
  }

  /**
   * @param {string} docName
   * @param attrName
   * @param attrValue
   * @returns {Promise<DocumentItem>}
   */
  async storeDoc(docName, attrName, attrValue) {
    const doc = {
      name: docName,
      [attrName]: toBase64(attrValue),
    };
    // eslint-disable-next-line no-param-reassign
    await this.#bucket.put(getDocKey(docName), JSON.stringify(doc), 'application/json');
  }
}
