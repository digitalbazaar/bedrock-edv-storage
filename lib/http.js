/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
require('bedrock-express');
const brZCapStorage = require('bedrock-zcap-storage');
const helpers = require('./helpers');
const {meters} = require('bedrock-meter-usage-reporter');
const storage = require('./storage');

require('./http/edvs.js');
require('./http/docs.js');
require('./http/chunks.js');
require('./http/revocations.js');

// configure usage aggregator for EDV meters
const {SERVICE_TYPE} = helpers;
meters.setAggregator({serviceType: SERVICE_TYPE, handler: _aggregateUsage});

async function _aggregateUsage({meter, signal} = {}) {
  const {id: meterId} = meter;
  return storage.getStorageUsage({
    meterId, aggregate: _addRevocationUsage, signal
  });
}

async function _addRevocationUsage({config, usage}) {
  // add storage units for revocations associated with the EDV
  const {id: edvId} = config;
  const {storageCost} = bedrock.config['edv-storage'];
  // if `count` is available, use it to count stored revocations
  if(brZCapStorage.revocations.count) {
    const {count} = await brZCapStorage.revocations.count(
      {rootTarget: edvId});
    usage.storage += count * storageCost.revocation;
  }
}
