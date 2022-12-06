/*!
 * Copyright (c) 2019-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as brZCapStorage from '@bedrock/zcap-storage';
import * as chunks from '../storage/chunks.js';
import * as database from '@bedrock/mongodb';
import * as docs from '../storage/docs.js';
import {logger} from '../logger.js';
import {meters} from '@bedrock/meter-usage-reporter';
import pAll from 'p-all';

const {util: {BedrockError}} = bedrock;

const USAGE_COUNTER_MAX_CONCURRENCY = 100;

// configure usage aggregator for EDV meters
export const SERVICE_TYPE = 'edv';
meters.setAggregator({serviceType: SERVICE_TYPE, handler: _aggregateUsage});

export function reportOperationUsage({req}) {
  // do not wait for usage to be reported
  const {config, config: {meterId: id}} = req.edv;
  meters.use({id, operations: 1}).catch(
    error => logger.error(
      `EDV (${config.id}) meter (${id}) usage error.`, {error}));
}

async function _aggregateUsage({meter, signal} = {}) {
  const {id: meterId} = meter;
  return _getStorageUsage({
    meterId, aggregate: _addRevocationUsage, signal
  });
}

async function _addRevocationUsage({config, usage}) {
  // add storage units for revocations associated with the EDV
  const {id: edvId} = config;
  const {storageCost} = bedrock.config['edv-storage'];
  // if `count` is available, use it to count stored revocations
  if(brZCapStorage.revocations.count) {
    const {count} = await brZCapStorage.revocations.count({rootTarget: edvId});
    usage.storage += count * storageCost.revocation;
  }
}

/**
 * Gets storage statistics for the given meter. This includes the total number
 * of EDVs, documents, and chunks associated with a meter ID, represented as
 * storage units according to this module's configuration.
 *
 * @param {object} options - The options to use.
 * @param {string} options.meterId - The ID of the meter to get.
 * @param {AbortSignal} [options.signal] - An abort signal to check.
 * @param {Function} [options.aggregate] - An aggregate function that will
 *   receive each EDV config that matches the `meterId` and the current
 *   usage; this function may be called to add custom additional usage
 *   associated with an EDV.
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @returns {Promise<object | ExplainObject>} Resolves with the storage usage
 *   for the meter or an ExplainObject if `explain=true`.
 */
async function _getStorageUsage({
  meterId, signal, aggregate, explain = false
} = {}) {
  // find all EDVs with the given meter ID
  const cursor = await database.collections['edv-storage-config'].find(
    {'config.meterId': meterId},
    {projection: {_id: 0, config: 1, meta: 1}});

  if(explain) {
    return cursor.explain('executionStats');
  }

  const {storageCost} = bedrock.config['edv-storage'];
  const usage = {storage: 0};
  const counters = [];
  while(await cursor.hasNext()) {
    // get next EDV config
    const {config, meta} = await cursor.next();

    // do not count any pending config
    if(meta.state == 'pending') {
      continue;
    }

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
}

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

/**
 * An object containing information on the query plan.
 *
 * @typedef {object} ExplainObject
 */
