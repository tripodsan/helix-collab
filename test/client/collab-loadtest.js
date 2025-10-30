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
import { WebsocketProvider } from '@adobe/y-websocket';
import { ySyncPlugin, initProseMirrorDoc } from 'y-prosemirror';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import jsdom from 'jsdom';
import { schema } from './schema.js';
import { yHeadlessCursorPlugin } from './headless-cursor-plugin.js';

const { JSDOM } = jsdom;

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

// const SERVER = 'https://z21npzmtdj.execute-api.us-east-1.amazonaws.com';
const SERVER = 'http://localhost:8080';

async function client() {
  const ydoc = new Y.Doc();
  const provider = new WebsocketProvider(SERVER, 'prod00', ydoc, {
    params: {
      doc: 'test-room',
    },
    protocols: ['yjs', '*'],
    useBase64: true,
    connect: false,
  });

  const userName = `TestUser-${Math.floor(Math.random() * 100)}`;

  const type = ydoc.getXmlFragment('prosemirror');
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.forwardTo(console);
  const dom = new JSDOM('', { virtualConsole });
  global.window = dom.window;
  global.document = dom.window.document;
  global.ClipboardEvent = Event;

  const { doc, mapping } = initProseMirrorDoc(type, schema);
  const view = new EditorView(null, {
    state: EditorState.create({
      doc,
      schema,
      plugins: [
        ySyncPlugin(type, { mapping }),
        yHeadlessCursorPlugin(provider.awareness),
      ],
    }),
  });

  async function executeTest() {
    console.log('set user name to: ', userName);
    provider.awareness.setLocalStateField('user', {
      name: userName,
      color: `#${Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')}`,
    });
    console.log('test sleep 500...');
    await sleep(500);
    console.log('set selection');

    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)),
    );

    console.log('test sleep 500...');
    await sleep(500);
    console.log('insert hello');
    view.pasteText('hello, world (pasted)!');
    view.dispatch(
      view.state.tr.insert(
        0,
        /** @type {any} */ (schema.node(
          'paragraph',
          undefined,
          schema.text(`hello world from ${userName}`),
        )),
      ),
    );
    await sleep(500);
    console.log('disconnet');
    view.destroy();
    provider.destroy();
  }

  provider.on('status', async (arg) => {
    console.log('status', arg);
    console.log('clientID', provider.doc.clientID);
    if (arg.status === 'connected') {
      setTimeout(executeTest, 100);
    }
  });

  provider.connect();
}

await client();
