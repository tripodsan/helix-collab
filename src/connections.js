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
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { toBase64 } from 'lib0/buffer';

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

export class Connections {
  /**
   * @type DynamoDBClient
   */
  #client;

  /**
   * @type DynamoDBDocument
   */
  #docClient;

  /**
   * @type string
   */
  #docTableName;

  /**
   * @type string
   */
  #conTableName;

  constructor() {
    this.#client = new DynamoDBClient({});
    this.#docClient = DynamoDBDocument.from(this.#client);
    this.#docTableName = DOC_TABLE_NAME;
    this.#conTableName = CON_TABLE_NAME;
  }

  destroy() {
    this.#docClient.destroy();
    this.#client.destroy();
  }

  /**
   *
   * @param {string} id
   * @param {string} docName
   * @returns {Promise<boolean>}
   */
  async addConnection(id, docName) {
    const ret = await this.#docClient.put({
      TableName: this.#conTableName,
      Item: {
        id,
        docName,
        created: new Date().toISOString(),
      },
      ConditionExpression: 'attribute_not_exists(id)',
    });
    console.log('addConnection(%s, %s) -> %j', id, docName, ret);
    return ret.$metadata.httpStatusCode === 200;
  }

  /**
   *
   * @param id
   * @returns {Promise<ConnectionItem>}
   */
  async getConnection(id) {
    const ret = await this.#docClient.get({
      TableName: this.#conTableName,
      Key: {
        id,
      },
    });
    console.log('getConnection(%s) -> %j', id, ret);
    return ret.Item || null;
  }

  /**
   *
   * @param {string} id
   * @returns {Promise<bool>}
   */
  async removeConnection(id) {
    const ret = await this.#docClient.delete({
      TableName: this.#conTableName,
      Key: {
        id,
      },
    });
    console.log('removeConnection(%s) -> %j', id, ret);
    return ret.$metadata.httpStatusCode === 200;
  }

  /**
   *
   * @param {string} docName
   * @returns {Promise<string[]>}
   */
  async getConnectionIds(docName) {
    const ret = await this.#docClient.query({
      TableName: this.#conTableName,
      KeyConditionExpression: 'docName = :docnameval',
      IndexName: 'docName-index',
      ExpressionAttributeValues: {
        ':docnameval': docName,
      },
    });
    console.log('getConnectionIds(%s) -> %j', docName, ret);
    return ret.Items?.map(({ id }) => id) ?? [];
  }

  /**
   * @param {string} docName
   * @returns {Promise<DocumentItem>}
   */
  async getDoc(docName) {
    const ret = await this.#docClient.get({
      TableName: this.#docTableName,
      Key: {
        docName,
      },
    });
    console.log('getDoc(%s) -> %j', docName, ret);
    return ret.Item || null;
  }

  /**
   * @param {string} docName
   * @returns {Promise<bool>}
   */
  async removeDoc(docName) {
    const ret = await this.#docClient.delete({
      TableName: this.#docTableName,
      Key: {
        docName,
      },
    });
    console.log('removeDoc(%s) -> %j', docName, ret);
    return ret.$metadata.httpStatusCode === 200;
  }

  /**
   *
   * @param {String} docName
   * @returns {Promise<DocumentItem>}
   */
  async getOrCreateDoc(docName) {
    let doc = await this.#docClient.get({
      TableName: this.#docTableName,
      Key: {
        docName,
      },
    });
    if (!doc.Item) {
      const ret = await this.#docClient.put({
        TableName: this.#docTableName,
        Item: {
          docName,
          updates: [],
        },
      });
      doc = {
        docName,
        updates: [],
      };
      console.log('createDoc(%s) -> %j', docName, ret);
    } else {
      console.log('getDoc(%s) -> %j', docName, doc);
      doc = doc.Item;
    }
    return doc;
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
   * @returns {Promise<bool>}
   */
  async updateDoc(docName, update) {
    const ret = await this.#docClient.update({
      TableName: this.#docTableName,
      UpdateExpression: 'SET updates = list_append(updates, :attrValue)',
      Key: {
        docName,
      },
      ExpressionAttributeValues: {
        ':attrValue': [update],
      },
    });
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
    console.log('updateDoc(%s, %s) -> %j', docName, update, ret);
    return ret.$metadata.httpStatusCode === 200;

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
