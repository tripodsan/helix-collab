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
import {
  ApiGatewayManagementApiClient, GoneException,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { LambdaClient, InvokeCommand, InvocationType } from '@aws-sdk/client-lambda';
import { YSockets } from './ysockets.js';
import { Storage } from './storage.js';
import { DDBPersistence } from './ddb-persistence.js';

function getDocName(event) {
  const doc = event.queryStringParameters?.doc;
  if (!doc) {
    throw new Error('missing "doc" query parameter.');
  }
  return doc;
}

async function send(api, id, message) {
  // console.log('send(%s, %s)', id, message);
  try {
    await api.send(new PostToConnectionCommand(
      { ConnectionId: id, Data: message },
    ));
  } catch (e) {
    if (e instanceof GoneException) {
      console.log('connection gone %s', id);
    }
    throw e;
  }
}

/**
 * Sends a message async via invoke command
 * @param {string} id
 * @param {string} message
 * @returns {Promise<*>}
 */
async function sendMessageAsync(ctx, id, message) {
  const client = new LambdaClient({ region: process.env.AWS_REGION });
  try {
    console.log(`sending message to self for connection ${id}: ${ctx.arn}`);
    const output = await client.send(
      new InvokeCommand({
        FunctionName: ctx.arn,
        InvocationType: InvocationType.Event,
        Payload: JSON.stringify({
          requestContext: {
            routeKey: '$sendmessage',
            domainName: ctx.domainName,
            connectionId: id,
            apiId: ctx.apiId,
            stage: ctx.stage,
          },
          body: message,
        }),
      }),
    );
    console.log('result: ', output);
  } catch (e) {
    console.error('error invoking self', e);
  } finally {
    client.destroy();
  }
}

async function authorize(event) {
  // extract token from header
  const protocols = (event.headers?.['Sec-WebSocket-Protocol'] || '').split(',');
  console.log('protocols', protocols);
  const token = protocols.find((hdr) => hdr !== 'yjs').trim();
  console.log('token', token);
  return token === process.env.WS_TOKEN;
}

/**
 * The raw universal adapter for lambda functions
 * @param {object} event AWS Lambda event
 * @param {object} context AWS Lambda context
 * @returns {*} lambda response
 */
export async function run(event, context) {
  console.log('EVENT', event, context);

  const { body, requestContext: { connectionId, routeKey } = {} } = event;

  const storage = new Storage(new DDBPersistence());
  const callbackAPI = new ApiGatewayManagementApiClient({
    apiVersion: '2018-11-29',
    endpoint: `https://${event.requestContext.domainName}/${event.requestContext.stage}`,
  });

  let ysockets;
  try {
    if (routeKey === '$connect') {
      // this uses a different send, so we keep it outside the switch block
      if (!await authorize(event)) {
        console.log('unauthorized');
        return {
          statusCode: 401,
          body: 'Unauthorized',
        };
      }
      const docName = getDocName(event);
      const ctx = {
        arn: context.invokedFunctionArn,
        domainName: event.requestContext.domainName,
        stage: event.requestContext.stage,
        apiId: event.requestContext.apiId,
      };
      ysockets = new YSockets(storage, sendMessageAsync.bind(null, ctx));
      // eslint-disable-next-line max-len
      await ysockets.onConnection(connectionId, docName);
      return {
        statusCode: 200,
        body: 'Connected.',
        headers: {
          'Sec-WebSocket-Protocol': 'yjs',
        },
      };
    }

    ysockets = new YSockets(storage, send.bind(null, callbackAPI));
    switch (routeKey) {
      case '$disconnect': {
        await ysockets.onDisconnect(connectionId);
        return { statusCode: 200, body: 'Disconnected.' };
      }
      case '$default':
        await ysockets.onMessage(connectionId, body);
        return { statusCode: 200, body: 'Data Sent' };
      case '$sendmessage':
        // special route to handle message during connect
        console.log('handling async message from self.');
        await send(callbackAPI, connectionId, body);
        return { statusCode: 200, body: 'Data Sent' };
      default:
        // this is via the http api
        return {
          status: 200,
          body: 'hello, world!',
        };
    }
  } catch (e) {
    console.error('Internal Error:', e);
    return {
      status: 500,
      body: `Internal Error: ${e}`,
    };
  } finally {
    ysockets?.destroy();
  }
}
