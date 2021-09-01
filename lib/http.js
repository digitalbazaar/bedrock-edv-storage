/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
require('bedrock-express');
const {config} = bedrock;
const helpers = require('./helpers');
const {meters} = require('bedrock-meter-usage-reporter');

require('./http/edvs.js');
require('./http/docs.js');
require('./http/chunks.js');
require('./http/revocations.js');

// configure usage aggregator for EDV meters
const {SERVICE_TYPE} = helpers;
meters.setAggregator({serviceType: SERVICE_TYPE, handler: _aggregateUsage});

async function _aggregateUsage({/*meter, signal*/} = {}) {
  //const {id: meterId} = meter;
  const [usage, revocationCount] = await Promise.all([
    // FIXME: implement `storage.getUsage()`
    //storage.getStorageUsage({meterId, signal}),
    {storage: 0},
    // FIXME: get zcap revocation count associated with this meter
    // https://github.com/digitalbazaar/bedrock-kms-http/issues/55
    0
  ]);

  // sum edv storage and revocation storage
  const {storageCost} = config['edv-storage'];
  usage.storage += revocationCount * storageCost.revocation;

  return usage;
}
