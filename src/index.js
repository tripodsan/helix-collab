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

function getDocName(event) {
  const doc = event.queryStringParameters?.doc;
  if (!doc) {
    throw new Error('missing "doc" query parameter.');
  }
  return doc;
}

async function send(api, id, message) {
  console.log('send(%s, %s)', id, message);
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

/**
 * The raw universal adapter for lambda functions
 * @param {object} event AWS Lambda event
 * @param {object} context AWS Lambda context
 * @returns {*} lambda response
 */
export async function run(event, context) {
  console.log('EVENT', event, context);

  const { body, requestContext: { connectionId, routeKey } = {} } = event;

  const ysockets = new YSockets();
  const callbackAPI = new ApiGatewayManagementApiClient({
    apiVersion: '2018-11-29',
    endpoint: `https://${event.requestContext.domainName}/${event.requestContext.stage}`,
  });

  try {
    switch (routeKey) {
      case '$connect': {
        const docName = getDocName(event);
        const ctx = {
          arn: context.invokedFunctionArn,
          domainName: event.requestContext.domainName,
          stage: event.requestContext.stage,
          apiId: event.requestContext.apiId,
        };
        // eslint-disable-next-line max-len
        await ysockets.onConnection(connectionId, docName, sendMessageAsync.bind(null, ctx));
        return { statusCode: 200, body: 'Connected.' };
      }
      case '$disconnect': {
        await ysockets.onDisconnect(connectionId);
        return { statusCode: 200, body: 'Disconnected.' };
      }
      case '$default':
        await ysockets.onMessage(connectionId, body, send.bind(null, callbackAPI));
        return { statusCode: 200, body: 'Data Sent' };
      // special route to handle message during connect
      case '$sendmessage':
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
    return {
      status: 500,
      body: `Internal Error: ${e}`,
    };
  } finally {
    ysockets.destroy();
  }
}
