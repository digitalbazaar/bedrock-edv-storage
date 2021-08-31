/*
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
const {config} = bedrock;
const path = require('path');
require('bedrock-meter-usage-reporter');
require('bedrock-validation');

const namespace = 'edv-storage';
const cfg = config[namespace] = {};

const basePath = '/edvs';
cfg.routes = {
  basePath
};

// storage size to report to meter service
cfg.storageCost = {
  edv: 1,
  revocation: 1
};

// create dev meter usage reporter client (must be overridden in deployments)
// ...and `ensureConfigOverride` has already been set via
// `bedrock-meter-usage-reporter` so it doesn't have to be set here
config['meter-usage-reporter'].clients.edv = {
  id: 'did:key:z6MkgwieJDAgdUQyD17L6TsGJon57jt3yxZrtw7rg3tJ5orH',
  keyPair: {
    id: 'did:key:z6MkgwieJDAgdUQyD17L6TsGJon57jt3yxZrtw7rg3tJ5orH#' +
      'z6MkgwieJDAgdUQyD17L6TsGJon57jt3yxZrtw7rg3tJ5orH',
    type: 'Ed25519VerificationKey2020',
    publicKeyMultibase: 'z6MkgwieJDAgdUQyD17L6TsGJon57jt3yxZrtw7rg3tJ5orH',
    privateKeyMultibase: 'zrv4SV17sr6L2Ymyyu3Uj7cvJm3qvmMKbzW1wwJkpuGiQj5' +
      'XqQeF5nmtwoP86VH7zzT2v4uS921gJzbztbdbCakwd8D'
  }
};

// common validation schemas
config.validation.schema.paths.push(
  path.join(__dirname, '..', 'schemas'));
