/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
const bedrock = require('bedrock');
require('bedrock-edv-storage');
require('bedrock-https-agent');
require('bedrock-kms');
require('bedrock-kms-http');
require('bedrock-server');

// this is responsible for providing the `ssm-v1` key store
require('bedrock-ssm-mongodb');

require('bedrock-test');
bedrock.start();
