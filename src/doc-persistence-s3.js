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

function getDocKey(docName) {
  return `/helix-collab/docs/${docName}`.replaceAll(/\/+/g, '/');
}

/**
 * @implements {import('./doc-persistence.js').DocPersistence}
 */
export class DocPersistenceS3 {
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

  /**
   * stores the doc in the underlying s3 bucket
   * @param {string} docName
   * @param {string} content
   * @returns {Promise<void>}
   */
  async saveDoc(docName, content) {
    await this.#bucket.put(getDocKey(docName), content, 'text/html');
  }

  /**
   * loads the doc from the underlying s3 bucket
   * @param {string} docName
   * @param {string} content
   * @returns {Promise<Buffer>}
   */
  async loadDoc(docName) {
    await this.#bucket.get(getDocKey(docName));
  }
}
