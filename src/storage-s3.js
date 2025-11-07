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
import {S3Client} from "@aws-sdk/client-s3";

const CON_TABLE_NAME = 'helix-test-collab-v0-connections';
const DOC_TABLE_NAME = 'helix-test-collab-v0-docs';

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

export class Storage {
  /**
   * @type S3Client
   */
  #client;

  /**
   * @type {string}
   */
  #bucketId = 'helix-tier3-test-bucket';

  /**
   * @param {DDBPersistence} persistence
   */
  constructor(persistence) {
    this.#client = new S3Client({
      region: 'us-east-1',
    });
  }

  destroy() {
    this.#client.destroy();
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
        console.log('cache miss for connection %s', id);
        cacheConnection(item);
      }
    } else {
      console.log('cache hit for connection %s', id);
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
      console.log('no connections cached for doc %s', docName);
    } else {
      const now = Date.now();
      if (conns && (now - conns.lastRefreshed) < 5000) {
        console.log('connection ids cache hit for doc %s', docName);
        return Array.from(conns.ids);
      }
      console.log('connection ids cache miss for doc %s', docName);
      conns.lastRefreshed = now;
    }
    const ret = await this.#ps
      .listItems(this.#conTableName, 'docName', docName, 'docName-index');
    const ids = ret.map(({ id }) => id) ?? [];
    // update the cache
    if (!conns) {
      conns = {
        ids: new Set(),
        lastRefreshed: Date.now(),
      };
      ConnectionsByDocCache.set(docName, conns);
    }
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
   * @returns {Promise<boolean>}
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
}
