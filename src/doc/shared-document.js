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
import { doc2aem, aem2doc } from './collab.js';

export const showError = (ydoc, err) => {
  try {
    const em = ydoc.getMap('error');

    // Perform the change in a transaction to avoid seeing a partial error
    ydoc.transact(() => {
      em.set('timestamp', Date.now());
      em.set('message', err.message);
      em.set('stack', err.stack);
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[docroom] Error while showing error', e, err);
  }
};

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

  static fromAEM(name, content) {
    const ydoc = new SharedDocument().withName(name);
    const rootType = ydoc.getXmlFragment('prosemirror');
    ydoc.transact(() => {
      try {
        // clear document
        rootType.delete(0, rootType.length);
        // restore from da-admin
        aem2doc(content, ydoc);

        // eslint-disable-next-line no-console
        console.log('[docroom] Restored from da-admin', name);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[docroom] Problem restoring state from da-admin', error, content);
        showError(ydoc, error);
      }
    });
    return ydoc;
  }
}
