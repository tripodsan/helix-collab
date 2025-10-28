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
// eslint-disable-next-line max-classes-per-file
import fs from 'fs/promises';
import { resolve } from 'path';

class AsyncMutex {
  constructor() {
    this.locked = false;
    this.resolvers = [];
  }

  async lock() {
    while (this.locked) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((res) => {
        this.resolvers.push(res);
      });
    }
    this.locked = true;
  }

  unlock() {
    if (!this.locked) {
      throw Error('unlock must not be used outside lock.');
    }
    this.locked = false;
    if (this.resolvers.length > 0) {
      const res = this.resolvers.shift();
      res();
    }
  }
}

const mutex = new AsyncMutex();

export class LocalPersistence {
  #dir;

  #debug = true;

  constructor(dir = process.cwd()) {
    this.#dir = resolve(dir);
  }

  // eslint-disable-next-line class-methods-use-this
  destroy() {
  }

  async #openTable(tableName) {
    const path = resolve(this.#dir, `${tableName}.json`);
    try {
      const data = await fs.readFile(path, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      if (e.code === 'ENOENT') {
        return [];
      }
      throw e;
    }
  }

  async #saveTable(tableName, table) {
    const path = resolve(this.#dir, `${tableName}.json`);
    await fs.writeFile(path, JSON.stringify(table, null, 2), 'utf-8');
  }

  /**
   * @param tableName
   * @param attrs
   * @returns {Promise<boolean>}
   */
  async createItem(tableName, attrs) {
    try {
      await mutex.lock();
      const table = await this.#openTable(tableName);
      if (table.find((item) => item.id === attrs.id)) {
        return false;
      }
      table.push(attrs);
      await this.#saveTable(tableName, table);
      if (this.#debug) {
        console.log('createItem(%s, %j)', tableName, attrs);
      }
      return true;
    } catch (e) {
      console.log('createItem(%s, %j) failed: %s', tableName, attrs, e);
      throw e;
    } finally {
      await mutex.unlock();
    }
  }

  async getOrCreateItem(tableName, keyName, key, attrName, attr) {
    try {
      if (attr instanceof Buffer) {
        // eslint-disable-next-line no-param-reassign
        attr = attr.toString('base64');
      }
      await mutex.lock();
      const table = await this.#openTable(tableName);
      let item = table.find((i) => i[keyName] === key);
      if (!item) {
        item = {
          [keyName]: key,
          [attrName]: attr,
        };
        table.push(item);
      }
      await this.#saveTable(tableName, table);
      if (this.#debug) {
        console.log('getOrCreateItem(%s, %s:%s %s:%s) -> %j', tableName, keyName, key, attrName, attr, item);
      }
      if ('state' in item) {
        // TODO: don't assume binary
        item.state = Buffer.from(item.state, 'base64');
      }
      return item;
    } finally {
      await mutex.unlock();
    }
  }

  async updateItem(tableName, keyName, key, attrName, attr) {
    try {
      if (attr instanceof Buffer) {
        // eslint-disable-next-line no-param-reassign
        attr = attr.toString('base64');
      }
      await mutex.lock();
      const table = await this.#openTable(tableName);
      let item = table.find((i) => i[keyName] === key);
      if (!item) {
        item = {
          [keyName]: key,
          [attrName]: attr,
        };
        table.push(item);
      } else {
        item[attrName] = attr;
      }
      await this.#saveTable(tableName, table);
      if (this.#debug) {
        console.log('updateItem(%s, %s:%s %s:%s) -> %j', tableName, keyName, key, attrName, attr, item);
      }
      if ('state' in item) {
        // TODO: don't assume binary
        item.state = Buffer.from(item.state, 'base64');
      }
      return item;
    } finally {
      await mutex.unlock();
    }
  }

  /**
   * @param tableName
   * @param keyName
   * @param key
   * @returns {Promise<Record<string, any>|null>}
   */
  async getItem(tableName, keyName, key) {
    try {
      await mutex.lock();
      const table = await this.#openTable(tableName);
      const item = table.find((i) => i[keyName] === key);
      if (this.#debug) {
        console.log('getItem(%s, %s:%s) -> %j', tableName, keyName, key, item);
      }
      if ('state' in item) {
        // TODO: don't assume binary
        item.state = Buffer.from(item.state, 'base64');
      }
      return item || null;
    } finally {
      await mutex.unlock();
    }
  }

  /**
   * @param tableName
   * @param keyName
   * @param key
   * @returns {Promise<boolean>}
   */
  async removeItem(tableName, keyName, key) {
    try {
      await mutex.lock();
      const table = await this.#openTable(tableName);
      const index = table.findIndex((item) => item[keyName] === key);
      if (index === -1) {
        return false;
      }
      table.splice(index, 1);
      await this.#saveTable(tableName, table);
      if (this.#debug) {
        console.log('removeItem(%s, %s:%s) -> true', tableName, keyName, key);
      }
      return true;
    } finally {
      await mutex.unlock();
    }
  }

  /**
   * @param tableName
   * @param keyName
   * @param key
   * @param index
   * @returns {Promise<Record<string, NativeAttributeValue>[]|*[]>}
   */
  // eslint-disable-next-line no-unused-vars
  async listItems(tableName, keyName, key, index) {
    try {
      await mutex.lock();
      const table = await this.#openTable(tableName);
      const items = table.filter((item) => item[keyName] === key);
      if (this.#debug) {
        console.log('listItems(%s, %s:%s) -> %j', tableName, keyName, key, items);
      }
      return items;
    } finally {
      await mutex.unlock();
    }
  }

  /**
   * @param tableName
   * @param keyName
   * @param key
   * @param attrName
   * @param attr
   * @returns {Promise<boolean>}
   */
  async appendItemValue(tableName, keyName, key, attrName, attr) {
    try {
      await mutex.lock();
      const table = await this.#openTable(tableName);
      const item = table.find((i) => i[keyName] === key);
      if (!item) {
        throw new Error(`Item with key ${key} not found in table ${tableName}`);
      }
      if (!Array.isArray(item[attrName])) {
        item[attrName] = [];
      }
      item[attrName].push(attr);
      await this.#saveTable(tableName, table);
      if (this.#debug) {
        console.log('appendItemValue(%s, %s:%s, %s:%s) -> true', tableName, keyName, key, attrName, attr);
      }
      return true;
    } finally {
      await mutex.unlock();
    }
  }
}
