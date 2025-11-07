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
import { readFile } from 'node:fs/promises';
import { format, parseArgs } from 'node:util';
import { config } from 'dotenv';
import { CollabDocument } from './collab-document.js';
import { schema } from './schema.js';

config();

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const TEXT = 'Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet.';
// const TEXT = 'Lorem ipsum.';

async function testClient(docName, userName) {
  console.log(`--> starting ${docName} / ${userName}`);
  const secrets = JSON.parse(await readFile('secrets.json', 'utf-8'));
  const doc = new CollabDocument(
    docName,
    schema,
    userName,
  );
  await doc
    .withServer(process.env.WS_SERVER)
    .withToken(secrets.WS_TOKEN)
    .setup();

  async function executeTest() {
    doc.setCursor(0);
    const words = TEXT.split(' ');
    console.log(`--> sending ${words.length} words to ${docName} / ${userName}`);
    words.unshift(`Hello from ${userName}: `);
    for (const word of words) {
      doc.pasteText(` ${word}`);
      // eslint-disable-next-line no-await-in-loop
      await sleep(word.length * 10 + Math.random() * 100 + 200);
    }
    doc.pasteText('\n');

    await sleep(500);
    doc.destroy();
  }

  const done = new Promise((resolve) => {
    doc.on('status', async (arg) => {
      if (arg.status === 'connected') {
        setTimeout(executeTest, 500);
      }
      if (arg.status === 'disconnected') {
        console.log(`<-- ending ${docName} / ${userName}`);
        resolve();
      }
    });
  });

  doc.connect();
  return done;
}

async function documentTest(docName, numUsers) {
  const clients = [];
  for (let i = 0; i < numUsers; i += 1) {
    clients.push(testClient(docName, `test-user-${i}`));
    // eslint-disable-next-line no-await-in-loop
    await sleep(1000);
  }
  await Promise.allSettled(clients);
}

async function run() {
  const options = {
    num: {
      type: 'string',
      short: 'n',
      default: '1',
    },
    concurrent: {
      type: 'string',
      short: 'c',
      default: '1',
    },
    docPattern: {
      type: 'string',
      short: 'd',
      default: 'test-doc-%d',
    },
    docSuffix: {
      type: 'string',
      short: 'd',
      default: 'test-doc-',
    },
    help: {
      type: 'boolean',
      short: 'h',
      default: false,
    },
  };
  const { values } = parseArgs({ args: process.argv.slice(2), options });
  if (values.help) {
    console.log('node collab-loadtest.js -n num -c concurrent');
    process.exit(0);
  }
  const numDocs = Number.parseInt(values.num, 10);
  const numUsers = Number.parseInt(values.concurrent, 10);

  const tests = [];
  for (let n = 0; n < numDocs; n += 1) {
    const docName = format(values.docPattern, n);
    tests.push(documentTest(docName, numUsers));
  }
  await Promise.allSettled(tests);
}

run().catch(console.error);
