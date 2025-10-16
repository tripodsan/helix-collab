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
import * as Y from 'yjs';

const CON_TABLE_NAME = 'helix-test-collab-v0-connections';
const DOC_TABLE_NAME = 'helix-test-collab-v0-docs';

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
   * @type DDBPersistence
   */
  #ps;

  /**
   * @type string
   */
  #docTableName;

  /**
   * @type string
   */
  #conTableName;

  /**
   * @param {DDBPersistence} persistence
   */
  constructor(persistence) {
    this.#ps = persistence;
    this.#docTableName = DOC_TABLE_NAME;
    this.#conTableName = CON_TABLE_NAME;
  }

  destroy() {
    this.#ps.destroy();
  }

  /**
   *
   * @param {string} id
   * @param {string} docName
   * @returns {Promise<boolean>}
   */
  async addConnection(id, docName) {
    return this.#ps.createItem(this.#conTableName, {
      id,
      docName,
      created: new Date().toISOString(),
    });
  }

  /**
   *
   * @param id
   * @returns {Promise<ConnectionItem>}
   */
  async getConnection(id) {
    return this.#ps.getItem(this.#conTableName, 'id', id);
  }

  /**
   *
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async removeConnection(id) {
    return this.#ps.removeItem(this.#conTableName, 'id', id);
  }

  /**
   *
   * @param {string} docName
   * @returns {Promise<string[]>}
   */
  async getConnectionIds(docName) {
    const ret = await this.#ps
      .listItems(this.#conTableName, 'docName', docName, 'docName-index');
    return ret.map(({ id }) => id) ?? [];
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
   * @returns {Promise<DocumentItem>}
   */
  async getOrCreateDoc(docName) {
    return this.#ps.getOrCreateItem(this.#docTableName, 'docName', docName, 'updates', []);
  }

  /**
   *
   * @param {String} docName
   * @returns {Promise<Y.Doc>}
   */
  async getOrCreateYDoc(docName) {
    const doc = await this.getOrCreateDoc(docName);

    // convert updates to an encoded array
    const updates = doc.updates.map(
      (update) => new Uint8Array(Buffer.from(update, 'base64')),
    );

    const ydoc = new Y.Doc();
    for (const update of updates) {
      try {
        Y.applyUpdate(ydoc, update);
      } catch (ex) {
        console.log('Something went wrong with applying the update');
      }
    }

    return ydoc;
  }

  /**
   *
   * @param {string} docName
   * @param {string} update
   * @returns {Promise<boolean>}
   */
  async updateDoc(docName, update) {
    return this.#ps.appendItemValue(this.#docTableName, 'docName', docName, 'updates', update);
    // let doc = await this.#docClient.get({
    //   TableName: this.#docTableName,
    //   Key: {
    //     docName,
    //   },
    // });
    // if (!doc.item) {
    //   doc = {
    //     docName,
    //     updates: [update],
    //   };
    // } else {
    //   const oldUpdates = doc.Item.updates.map(
    //     (upd) => new Uint8Array(Buffer.from(upd, 'base64')),
    //   );
    //   const mergedUpdate = Y.mergeUpdates(oldUpdates.concat([update]));
    //   doc = {
    //     docName,
    //     updates: [toBase64(mergedUpdate)],
    //   };
    // }
    // const ret = await this.#docClient.put({
    //   TableName: this.#docTableName,
    //   Item: doc,
    // });
    // console.log('updateDoc(%s, %s) -> %j', docName, update, ret);
    // return ret.$metadata.httpStatusCode === 200;

    /*
    Future: Try to compute diffs as one large update

    const existingDoc = await this.DatabaseHelper.getItem<DocumentItem>(docName);

        let dbDoc = {
            Updates: []
        }
        if(existingDoc) {
            dbDoc = existingDoc
        }else{
            await this.DatabaseHelper.createItem(docName, dbDoc, undefined, true)
        }

        const oldUpdates = dbDoc.Updates.map(update =>
        new Uint8Array(Buffer.from(update, 'base64')))

        // merge updates into one large update
        const mergedUpdate = Y.mergeUpdates(oldUpdates.concat([update]));

        return await this.DatabaseHelper.updateItemAttribute(docName,'Updates',
         [toBase64(mergedUpdate)], undefined) */
  }
}
