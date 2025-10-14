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
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = 'helix-test-collab-v0';

export async function disconnect(event) {
  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);
  const command = new DeleteCommand({
    TableName: TABLE_NAME,
    Key: {
      connectionId: event.requestContext.connectionId,
    },
  });

  try {
    await docClient.send(command);
  } catch (err) {
    console.log(err);
    return {
      statusCode: 500,
    };
  }
  console.log('$disconnect', event.requestContext.connectionId);
  return {
    statusCode: 200,
  };
}
