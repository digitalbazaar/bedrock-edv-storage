/*
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import {config} from 'bedrock';
import 'bedrock-meter-usage-reporter';

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

// create dev application identity for edv (must be overridden in deployments)
// ...and `ensureConfigOverride` has already been set via
// `bedrock-app-identity` so it doesn't have to be set here
config['app-identity'].seeds.services.edv = {
  id: 'did:key:z6MkhNyDoLpNcPv5grXoJSJVJjvApd46JU5nPL6cwi88caYW',
  seedMultibase: 'z1AgcCz4zGY5P3covUxqpaGTVs6U12H5aWH1FdyVABCwzkw',
  serviceType: 'edv'
};

cfg.authorizeZcapInvocationOptions = {
  maxChainLength: 10,
  // 300 second clock skew permitted by default
  maxClockSkew: 300,
  // 1 year max TTL by default
  maxDelegationTtl: 1 * 60 * 60 * 24 * 365 * 1000
};
