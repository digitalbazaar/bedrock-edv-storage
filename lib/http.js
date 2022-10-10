/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import bodyParser from 'body-parser';
import '@bedrock/express';

import './http/edvs.js';
import './http/docs.js';
import './http/chunks.js';
import './http/revocations.js';

// set body parser limit to 10mb for EDV documents
bedrock.events.on('bedrock-express.configure.bodyParser', app => {
  app.use(bodyParser.json({
    strict: false,
    limit: '10mb',
    type: ['json', '+json']
  }));
});
