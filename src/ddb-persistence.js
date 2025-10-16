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
import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';

export class DDBPersistence {
  /**
   * @type DynamoDBClient
   */
  #client;

  /**
   * @type DynamoDBDocument
   */
  #docClient;

  /**
   * @type boolean
   */
  #debug;

  constructor() {
    this.#client = new DynamoDBClient({});
    this.#docClient = DynamoDBDocument.from(this.#client);
    this.#debug = false;
  }

  destroy() {
    this.#docClient.destroy();
    this.#client.destroy();
  }

  /**
   * @param tableName
   * @param attrs
   * @returns {Promise<boolean>}
   */
  async createItem(tableName, attrs) {
    try {
      const ret = await this.#docClient.put({
        TableName: tableName,
        Item: {
          ...attrs,
        },
        ConditionExpression: 'attribute_not_exists(id)',
      });
      if (this.#debug) {
        console.log('createItem(%s, %j) -> %j', tableName, attrs, ret);
      }
      return ret.$metadata.httpStatusCode === 200;
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) {
        return false;
      }
      console.log('createItem(%s, %j) failed: %s', tableName, attrs, e);
      throw e;
    }
  }

  async getOrCreateItem(tableName, keyName, key, attrName, attr) {
    const ret = await this.#docClient.update({
      TableName: tableName,
      UpdateExpression: 'SET #attrName = if_not_exists(#attrName, :attrValue)',
      Key: {
        [keyName]: key,
      },
      ExpressionAttributeValues: {
        ':attrValue': attr,
      },
      ExpressionAttributeNames: {
        '#attrName': attrName,
      },
      ReturnValues: 'ALL_NEW',
    });
    if (this.#debug) {
      console.log('getOrCreateItem(%s, %s:%s %s:%s) -> %j', tableName, keyName, key, attrName, attr, ret);
    }
    return ret.Attributes;
  }

  /**
   * @param tableName
   * @param keyName
   * @param key
   * @returns {Promise<Record<string, any>|null>}
   */
  async getItem(tableName, keyName, key) {
    const ret = await this.#docClient.get({
      TableName: tableName,
      Key: {
        [keyName]: key,
      },
    });
    if (this.#debug) {
      console.log('getItem(%s, %s:%s) -> %j', tableName, keyName, key, ret);
    }
    return ret.Item || null;
  }

  /**
   * @param tableName
   * @param keyName
   * @param key
   * @returns {Promise<boolean>}
   */
  async removeItem(tableName, keyName, key) {
    const ret = await this.#docClient.delete({
      TableName: tableName,
      Key: {
        [keyName]: key,
      },
    });
    if (this.#debug) {
      console.log('removeItem(%s, %s:%s) -> %j', tableName, keyName, key, ret);
    }
    return ret.$metadata.httpStatusCode === 200;
  }

  /**
   * @param tableName
   * @param keyName
   * @param key
   * @param index
   * @returns {Promise<Record<string, NativeAttributeValue>[]|*[]>}
   */
  async listItems(tableName, keyName, key, index) {
    const ret = await this.#docClient.query({
      TableName: tableName,
      KeyConditionExpression: `${keyName} = :docnameval`,
      IndexName: index,
      ExpressionAttributeValues: {
        ':docnameval': key,
      },
    });
    if (this.#debug) {
      console.log('listItems(%s, %s:%s) -> %j', tableName, keyName, key, ret);
    }
    return ret.Items ?? [];
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
    const ret = await this.#docClient.update({
      TableName: tableName,
      UpdateExpression: `SET ${attrName} = list_append(${attrName}, :attrValue)`,
      Key: {
        [keyName]: key,
      },
      ExpressionAttributeValues: {
        ':attrValue': [attr],
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
    if (this.#debug) {
      console.log('updateItemValue(%s, %s:%s, %s:%s) -> %j', tableName, keyName, key, attrName, attr, ret);
    }
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
