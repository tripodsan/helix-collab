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
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { uuidv4 } from 'lib0/random';

export class DebounceQueue {
  /**
   * @type SQSClient
   */
  #client;

  /**
   * @type string
   */
  #queueUrl;

  constructor() {
    this.#client = new SQSClient();
    this.#queueUrl = 'https://sqs.us-east-1.amazonaws.com/282898975672/helix-collab-debounce.fifo';
  }

  /**
   * Dispatches an item with the given id and ttl.
   * @param {string} docName
   * @param {number} expireAt
   * @param {number} requestTime
   * @returns {Promise<void>}
   */
  async dispatch(docName, expireAt, requestTime) {
    const result = await this.#client.send(new SendMessageCommand({
      QueueUrl: this.#queueUrl,
      MessageGroupId: docName,
      // DelaySeconds: ttl + 1,
      MessageDeduplicationId: uuidv4(),
      MessageBody: JSON.stringify({
        queryStringParameters: {
          doc: docName,
        },
        requestContext: {
          routeKey: '$debounce-update',
        },
      }),
    }));

    console.log(`dispatched debounce msg for ${docName}. expireAt=${expireAt}, requestTime=${requestTime}, messageId: ${result.MessageId}`);
  }

  destroy() {
    this.#client.destroy();
  }
}
