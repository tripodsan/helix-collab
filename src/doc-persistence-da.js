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
import { fetch } from '@adobe/fetch';

/**
 * @implements {import('./doc-persistence.js').DocPersistence}
 */
export class DocPersistenceDA {
  // eslint-disable-next-line class-methods-use-this
  destroy() {
    // nothing to do
  }

  /**
   * stores the doc in da admin
   * @param {string} docName
   * @param {string} content
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line class-methods-use-this
  async saveDoc(docName, content) {
    const blob = new Blob([content], { type: 'text/html' });
    const formData = new FormData();
    formData.append('data', blob);

    const opts = { method: 'PUT', body: formData };
    const url = new URL(`https://admin.da.live/source/${docName}`.replaceAll(/\/+/g, '/'));
    const resp = await fetch(url, opts);
    console.log(`updated doc ${docName}: ${resp.status} ${resp.statusText}`);
  }

  /**
   * loads the doc from da admin
   * @param {string} docName
   * @param {string} content
   * @returns {Promise<string>}
   */
  // eslint-disable-next-line class-methods-use-this
  async loadDoc(docName) {
    const url = new URL(`https://admin.da.live/source/${docName}`.replaceAll(/\/+/g, '/'));
    const resp = await fetch(url);
    if (resp.ok) {
      const content = await resp.text();
      console.log(`loaded doc ${docName}: %d bytes`, content.length);
      return content;
    }
    console.log(`failed to load doc ${docName}: ${resp.status} ${resp.statusText}`);
    return null;
  }
}
