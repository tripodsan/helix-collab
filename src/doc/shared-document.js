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
import {doc2aem} from "./collab.js";

export class SharedDocument extends Y.Doc {

  #storage;

  name;

  connectionId;

  withName(name) {
    this.name = name;
    return this;
  }

  withConnectionId(connectionId) {
    this.connectionId = connectionId;
    return this;
  }

  withStorage(storage) {
    this.#storage = storage;
    return this;
  }

  async onUpdate(update, origin, doc) {
    // const content = doc2aem(this);
    // await this.#storage.put(this.name, content);
  }

  /**
   * initializes the listeners
   */
  init() {
    this.on('update', this.onUpdate.bind(this));
  }
}
