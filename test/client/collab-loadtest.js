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
import {
  ySyncPlugin, yCursorPlugin, yUndoPlugin, undo, redo, initProseMirrorDoc,
} from 'y-prosemirror';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

// import { exampleSetup } from 'prosemirror-example-setup';
// import { keymap } from 'prosemirror-keymap';
import { schema } from './schema.js';

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
    connect: true,
  });
  const type = ydoc.getXmlFragment('prosemirror');
  // const editor = document.createElement('div')
  // editor.setAttribute('id', 'editor')
  // const editorContainer = document.createElement('div')
  // editorContainer.insertBefore(editor, null)
  const { doc, mapping } = initProseMirrorDoc(type, schema);
  const view = new EditorView(null, {
    state: EditorState.create({
      doc,
      schema,
      plugins: [
        ySyncPlugin(type, { mapping }),
        // yCursorPlugin(provider.awareness),
        // yUndoPlugin(),
        // keymap({
        //   'Mod-z': undo,
        //   'Mod-y': redo,
        //   'Mod-Shift-z': redo,
        // }),
      ], // .concat(exampleSetup({ schema, history: false })),
    }),
  });
  provider.on('status', (arg) => {
    console.log('status', arg);
    console.log('clientID', provider.doc.clientID);
  });

  console.log('sleep 1...');
  await sleep(1000);
  console.log('insert hello');
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (schema.node(
        'paragraph',
        undefined,
        schema.text('hello world'),
      )),
    ),
  );
}

await client();
