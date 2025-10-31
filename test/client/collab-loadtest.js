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
import { CollabDocument } from './collab-document.js';

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

// const SERVER = 'https://z21npzmtdj.execute-api.us-east-1.amazonaws.com';

const TEXT = 'Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet.';

async function client() {
  const doc = new CollabDocument('test-room', `TestUser-${Math.floor(Math.random() * 100)}`);
  await doc
    // .withServer(SERVER)
    .setup();

  async function executeTest() {
    doc.setCursor(0);

    const words = TEXT.split(' ');
    let delim = '';
    for (const word of words) {
      doc.pasteText(`${delim}${word}`);
      delim = ' ';
      // eslint-disable-next-line no-await-in-loop
      await sleep(word.length * 5 + Math.random() * 100);
    }
    doc.pasteText('\n');

    await sleep(500);
    doc.destroy();
  }

  doc.on('status', async (arg) => {
    if (arg.status === 'connected') {
      setTimeout(executeTest, 100);
    }
  });

  doc.connect();
}

client();
await sleep(500);
client();
await sleep(500);
client();
await sleep(500);
client();
