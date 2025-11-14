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
import { doc2aem } from './collab.js';

export class SharedDocument extends Y.Doc {
  name;

  connectionId;

  diskSize = 0;

  withName(name) {
    this.name = name;
    return this;
  }

  withConnectionId(connectionId) {
    this.connectionId = connectionId;
    return this;
  }

  /**
   * converts the Yjs document to AEM format
   */
  toAEM() {
    return doc2aem(this);
  }
}
