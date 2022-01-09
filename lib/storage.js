/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
const chunks = require('./storage/chunks.js');
const database = require('bedrock-mongodb');
const docs = require('./storage/docs.js');
const edvs = require('./storage/edvs.js');
const pAll = require('p-all');
const {util: {BedrockError}} = bedrock;

// module API
const api = {
  edvs,
  docs,
  chunks,
  // deprecated APIs:
  // EDVs
  insertConfig: edvs.insert,
  updateConfig: edvs.update,
  findConfig: edvs.find,
  getConfig: edvs.get,
  // docs
  insert: docs.insert,
  get: docs.get,
  find: docs.find,
  count: docs.count,
  update: docs.update,
  // chunks
  updateChunk: chunks.update,
  getChunk: chunks.get,
  removeChunk: chunks.remove
};
module.exports = api;

const USAGE_COUNTER_MAX_CONCURRENCY = 100;

/**
 * Gets storage statistics for the given meter. This includes the total number
 * of EDVs, documents, and chunks associated with a meter ID, represented as
 * storage units according to this module's configuration.
 *
 * @param {object} options - The options to use.
 * @param {string} options.meterId - The ID of the meter to get.
 * @param {AbortSignal} [options.signal] - An abort signal to check.
 * @param {function} [options.aggregate] - An aggregate function that will
 *   receive each EDV config that matches the `meterId` and the current
 *   usage; this function may be called to add custom additional usage
 *   associated with an EDV.
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @returns {Promise<object | ExplainObject>} Resolves with the storage usage
 *   for the meter or an ExplainObject if `explain=true`.
 */
api.getStorageUsage = async ({
  meterId, signal, aggregate, explain = false
} = {}) => {
  // find all EDVs with the given meter ID
  const cursor = await database.collections['edv-storage-config'].find(
    {'config.meterId': meterId},
    {projection: {_id: 0, config: 1}});

  if(explain) {
    return cursor.explain('executionStats');
  }

  const {storageCost} = bedrock.config['edv-storage'];
  const usage = {storage: 0};
  const counters = [];
  while(await cursor.hasNext()) {
    // get next EDV config
    const {config} = await cursor.next();

    // add storage units for EDV
    usage.storage += storageCost.edv;

    // if custom aggregator has been given, call it
    if(aggregate) {
      counters.push(() => {
        _checkComputeStorageSignal({signal, meterId});
        return aggregate({meterId, config, usage});
      });
    }

    // add storage units for docs in EDV
    const {id: edvId} = config;

    // start counting total docs size in EDV
    counters.push(() => {
      _checkComputeStorageSignal({signal, meterId});
      return _addDocsSize({usage, edvId, signal});
    });

    // start counting total chunks size in EDV
    counters.push(() => {
      _checkComputeStorageSignal({signal, meterId});
      return _addChunksSize({usage, edvId, signal});
    });

    _checkComputeStorageSignal({signal, meterId});
  }

  // await any counters that didn't complete
  await pAll(counters, {concurrency: USAGE_COUNTER_MAX_CONCURRENCY});

  return usage;
};

function _checkComputeStorageSignal({signal, meterId}) {
  if(signal && signal.abort) {
    throw new BedrockError(
      'Computing metered storage aborted.',
      'AbortError',
      {meterId, httpStatusCode: 503, public: true});
  }
}

async function _addDocsSize({usage, edvId}) {
  const {size} = await docs.getTotalSize({edvId});
  usage.storage += size;
}

async function _addChunksSize({usage, edvId}) {
  const {size} = await chunks.getTotalSize({edvId});
  usage.storage += size;
}
