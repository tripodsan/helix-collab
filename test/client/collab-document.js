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
import EventEmitter from 'node:events';
import * as Y from 'yjs';
import { WebsocketProvider } from '@adobe/y-websocket';
import { ySyncPlugin, initProseMirrorDoc } from 'y-prosemirror';
import { EditorState, Selection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import jsdom from 'jsdom';
import { schema } from './schema.js';
import { yHeadlessCursorPlugin } from './headless-cursor-plugin.js';

const { JSDOM } = jsdom;
global.ClipboardEvent = Event;

const DEFAULT_SERVER = 'http://localhost:8080';

export class CollabDocument extends EventEmitter {
  // bound event listener
  #onStatus;

  constructor(docName, userName) {
    super();
    this.docName = docName;
    this.userName = userName;
    this.server = DEFAULT_SERVER;
    this.room = 'prod00';
  }

  withServer(value) {
    this.server = value;
    return this;
  }

  withRoom(value) {
    this.room = value;
    return this;
  }

  async setup() {
    const ydoc = new Y.Doc();
    this.provider = new WebsocketProvider(this.server, this.room, ydoc, {
      params: {
        doc: this.docName,
      },
      protocols: ['yjs', '*'],
      useBase64: true,
      connect: false,
    });
    this.provider.awareness.setLocalStateField('user', {
      name: this.userName,
      color: `#${Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')}`,
    });

    // setup JSDOM
    const virtualConsole = new jsdom.VirtualConsole();
    virtualConsole.forwardTo(console);
    const dom = new JSDOM('', { virtualConsole });
    // not sure how well this works if every instance overwrites the globals....
    global.window = dom.window;
    global.document = dom.window.document;

    const type = ydoc.getXmlFragment('prosemirror');
    const { doc, mapping } = initProseMirrorDoc(type, schema);
    this.view = new EditorView(null, {
      state: EditorState.create({
        doc,
        schema,
        plugins: [
          ySyncPlugin(type, { mapping }),
          yHeadlessCursorPlugin(this.provider.awareness),
        ],
      }),
    });

    this.#onStatus = async (evt) => {
      console.log('[%s@%s] clientId %s, status: %s', this.userName, this.docName, this.provider.doc.clientID, evt.status);
      this.emit('status', evt);
    };
    this.provider.on('status', this.#onStatus);
    return this;
  }

  pasteText(text) {
    this.view.pasteText(text);
  }

  setCursor(pos) {
    const sel = pos < 0
      ? Selection.atEnd(this.view.state.doc)
      : TextSelection.create(this.view.state.doc, pos);
    this.view.dispatch(this.view.state.tr.setSelection(sel));
  }

  connect() {
    this.provider.connect();
    return this;
  }

  disconnect() {
    this.provider.disconnect();
    return this;
  }

  destroy() {
    this.view.destroy();
    this.provider.destroy();
    this.provider.off('status', this.#onStatus);
    return this;
  }
}
