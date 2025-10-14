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
  ApiGatewayManagementApiClient,
  GetConnectionCommand,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';

export async function defaultHandler(event) {
  let connectionInfo;
  const { connectionId } = event.requestContext;
  console.log('$default', connectionId);

  const callbackAPI = new ApiGatewayManagementApiClient({
    apiVersion: '2018-11-29',
    endpoint: `https://${event.requestContext.domainName}/${event.requestContext.stage}`,
  });

  try {
    connectionInfo = await callbackAPI.send(new GetConnectionCommand(
      { ConnectionId: event.requestContext.connectionId },
    ));
  } catch (e) {
    console.log(e);
  }

  connectionInfo.connectionID = connectionId;

  await callbackAPI.send(new PostToConnectionCommand(
    {
      ConnectionId: event.requestContext.connectionId,
      Data:
        `Use the sendmessage route to send a message. Your info:${
          JSON.stringify(connectionInfo)}`,
    },
  ));
  return {
    statusCode: 200,
  };
}
