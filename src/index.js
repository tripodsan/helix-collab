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
import wrap from '@adobe/helix-shared-wrap';
import { helixStatus } from '@adobe/helix-status';
import { connect } from './connect.js';
import { disconnect } from './disconnect.js';
import { sendMessage } from './send_message.js';
import { defaultHandler } from './default_handler.js';

/**
 * This is the main function
 * @param {Request} req the request object (see fetch api)
 * @param {UniversalContext} ctx the context of the universal serverless function
 * @returns {Response} a response
 */
// eslint-disable-next-line no-unused-vars
// async function run(req, ctx) {
//   return new Response('hello, world!');
// }
//
// export const main = wrap(run)
//   .with(helixStatus);
//
/**
   * The raw universal adapter for lambda functions
   * @param {object} event AWS Lambda event
   * @param {object} context AWS Lambda context
   * @returns {*} lambda response
   */
export async function run(event, context) {
  console.log(event, context);
  switch (event.requestContext.routeKey) {
    case '$connect':
      return connect(event);
    case '$disconnect':
      return disconnect(event);
    case 'sendmessage':
      return sendMessage(event);
    case '$default':
      return defaultHandler(event);
    default:
      // this is via the http api
      return {
        status: 200,
        body: 'hello, world!',
      };
  }
}
