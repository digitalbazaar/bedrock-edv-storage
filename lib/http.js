/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
const bodyParser = require('body-parser');
require('bedrock-express');

require('./http/edvs.js');
require('./http/docs.js');
require('./http/chunks.js');
require('./http/revocations.js');

// set body parser limit to 10mb for EDV documents
bedrock.events.on('bedrock-express.configure.bodyParser', app => {
  app.use(bodyParser.json({limit: '10mb', type: ['json', '+json']}));
});
