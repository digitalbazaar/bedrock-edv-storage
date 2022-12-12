/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as database from '@bedrock/mongodb';
import * as referenceIds from './referenceIds.js';
import assert from 'assert-plus';

const {util: {BedrockError}} = bedrock;

const COLLECTION_NAME = 'edv-storage-config';

bedrock.events.on('bedrock-mongodb.ready', async () => {
  await database.openCollections([COLLECTION_NAME]);

  await database.createIndexes([{
    // cover queries config by ID
    collection: COLLECTION_NAME,
    fields: {'config.id': 1},
    options: {unique: true, background: false}
  }, {
    // cover config queries by controller
    collection: COLLECTION_NAME,
    fields: {'config.controller': 1},
    options: {unique: false, background: false}
  }, {
    // cover counting EDVs in use by meter ID, if present
    collection: COLLECTION_NAME,
    fields: {'config.meterId': 1},
    options: {
      partialFilterExpression: {
        'config.meterId': {$exists: true}
      },
      unique: false, background: false
    }
  }]);
});

/**
 * An object containing information on the query plan.
 *
 * @typedef {object} ExplainObject
 */

/**
 * Establishes a new EDV by inserting its configuration into storage.
 *
 * @param {object} options - The options to use.
 * @param {object} options.config - The EDV configuration.
 *
 * @returns {Promise<object>} Resolves to the database record.
 */
export async function insert({config}) {
  assert.object(config, 'config');
  assert.string(config.id, 'config.id');
  assert.string(config.controller, 'config.controller');
  assert.string(config.meterId, 'config.meterId');

  // require starting sequence to be 0
  if(config.sequence !== 0) {
    throw new BedrockError(
      'Configuration sequence must be "0".',
      'DataError', {
        public: true,
        httpStatusCode: 400
      });
  }

  assert.object(config.keyAgreementKey, 'config.keyAgreementKey');
  assert.object(config.hmac, 'config.hmac');
  if(config.keyAgreementKey) {
    assert.string(config.keyAgreementKey.id, 'config.keyAgreementKey.id');
    assert.string(config.keyAgreementKey.type, 'config.keyAgreementKey.type');
  }
  if(config.hmac) {
    assert.string(config.hmac.id, 'config.hmac.id');
    assert.string(config.hmac.type, 'config.hmac.type');
  }

  // create config record
  const now = Date.now();
  const meta = {created: now, updated: now};
  const record = {
    meta,
    config
  };
  if(config.referenceId !== undefined) {
    meta.state = 'pending';
  }

  // first, insert config record (which will be marked pending if it has a
  // reference ID)
  try {
    const collection = database.collections[COLLECTION_NAME];
    const result = await collection.insertOne(record);
    const configRecord = result.ops[0];
    // if `referenceId` is set, ensure it is unique
    if(config.referenceId !== undefined) {
      return _ensureUnique({configRecord});
    }
    return configRecord;
  } catch(e) {
    if(!database.isDuplicateError(e)) {
      throw e;
    }

    throw new BedrockError('Duplicate configuration.', {
      name: 'DuplicateError',
      details: {configId: config.id, public: true, httpStatusCode: 409},
      cause: e
    });
  }
}

/**
 * Retrieves all EDV configs matching the given query.
 *
 * @param {object} options - The options to use.
 * @param {string} options.controller - The controller for the EDVs to
 *   retrieve.
 * @param {object} [options.query={}] - The optional query to use.
 * @param {object} [options.options={}] - Query options (eg: 'sort', 'limit').
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @returns {Promise<Array | ExplainObject>} Resolves with the records that
 *   matched the query or an ExplainObject if `explain=true`.
 */
export async function find({
  controller, query = {}, options = {}, explain = false
} = {}) {
  // force controller ID
  query['config.controller'] = controller;
  const collection = database.collections[COLLECTION_NAME];
  const cursor = await collection.find(query, options);

  if(explain) {
    return cursor.explain('executionStats');
  }

  return cursor.toArray();
}

/**
 * Updates an EDV config if its sequence number is next.
 *
 * @param {object} options - The options to use.
 * @param {object} options.config - The EDV configuration.
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @returns {Promise<boolean | ExplainObject>} Resolves with `true` on update
 *   success or an ExplainObject if `explain=true`.
 */
export async function update({config, explain = false} = {}) {
  assert.object(config, 'config');
  assert.string(config.id, 'config.id');
  assert.number(config.sequence, config.sequence);
  assert.string(config.controller, 'config.controller');

  // insert the configuration and get the updated record
  const now = Date.now();

  const collection = database.collections[COLLECTION_NAME];
  const query = {
    'config.id': config.id,
    'config.sequence': config.sequence - 1
  };
  if(config.referenceId !== undefined) {
    // if `referenceId` is set, do not modify a pending record, it should not
    // be treated as existent yet
    query['meta.state'] = {$ne: 'pending'};
  }

  if(explain) {
    // 'find().limit(1)' is used here because 'updateOne()' doesn't return a
    // cursor which allows the use of the explain function
    const cursor = await collection.find(query).limit(1);
    return cursor.explain('executionStats');
  }

  const result = await collection.updateOne(
    query, {$set: {config, 'meta.updated': now}});

  if(result.result.n === 0) {
    // no records changed...
    throw new BedrockError(
      'Could not update configuration. ' +
      'Record sequence does not match or configuration does not exist.',
      'InvalidStateError', {httpStatusCode: 409, public: true});
  }

  return true;
}

/**
 * Gets an EDV configuration.
 *
 * @param {object} options - The options to use.
 * @param {string} options.id - The ID of the EDV.
 * @param {boolean} options._allowPending - For internal use only; allows
 *   finding records that are in the process of being created.
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @returns {Promise<object | ExplainObject>} Resolves with the record that
 *   matches the query or an ExplainObject if `explain=true`.
 */
export async function get({id, _allowPending = false, explain = false} = {}) {
  assert.string(id, 'id');

  const collection = database.collections[COLLECTION_NAME];
  const query = {'config.id': id};
  if(!_allowPending) {
    query['meta.state'] = {$ne: 'pending'};
  }
  const projection = {_id: 0, config: 1, meta: 1};

  if(explain) {
    // 'find().limit(1)' is used here because 'findOne()' doesn't return a
    // cursor which allows the use of the explain function
    const cursor = await collection.find(query, {projection}).limit(1);
    return cursor.explain('executionStats');
  }

  const record = await collection.findOne(query, {projection});
  if(!record) {
    throw new BedrockError(
      'Configuration not found.',
      'NotFoundError',
      {edv: id, httpStatusCode: 404, public: true});
  }

  return record;
}

/**
 * Removes an existing EDV configuration.
 *
 * @param {object} options - The options to use.
 * @param {string} options.id - The config ID.
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @returns {Promise<boolean | ExplainObject>} Resolves with `true` on remove
 *   success or an ExplainObject if `explain=true`.
 */
export async function remove({id, explain = false} = {}) {
  assert.string(id, 'id');

  const collection = database.collections[COLLECTION_NAME];
  const query = {'config.id': id};

  if(explain) {
    // 'find().limit(1)' is used here because 'deleteOne()' doesn't return a
    // cursor which allows the use of the explain function
    const cursor = await collection.find(query).limit(1);
    return cursor.explain('executionStats');
  }

  let record;
  try {
    record = await get({id, _allowPending: true});
  } catch(e) {
    if(e.name !== 'NotFoundError') {
      throw e;
    }
    // record not found, nothing to delete
    return false;
  }

  // remove record
  const result = await collection.deleteOne(query);
  const removed = result.result.n > 0;
  if(removed) {
    // remove the controller + reference ID + configId mapping if present
    if(record.config.referenceId !== undefined) {
      // note: if this fails to be removed, the next insert attempt with the
      // same reference ID will clear it
      const {id: configId, controller, referenceId} = record.config;
      await referenceIds.remove({controller, referenceId, configId});
    }
  }

  return removed;
}

async function _ensureUnique({configRecord} = {}) {
  /* Note: Now we must handle configs with `referenceId` set. Since
  `referenceId` cannot be uniquely indexed in the config collection (as it
  would prevent sharding), we must insert any config that contains a reference
  ID in an unusable state and then switch its state to usable only once we have
  confirmed that it is unique in the separate reference IDs collection. */
  const {config} = configRecord;
  const {id: configId, controller, referenceId} = config;
  const collection = database.collections[COLLECTION_NAME];
  while(true) {
    // try to insert a reference ID mapping; this will trigger a duplicate
    // error if the mapping exists for a different config ID
    try {
      await referenceIds.insert({controller, referenceId, configId});
    } catch(e) {
      if(e.name === 'DuplicateError') {
        // if the mapping is a duplicate, ensure that a config record
        // exists that matches it
        let mappingRecord;
        try {
          mappingRecord = await referenceIds.get({controller, referenceId});
        } catch(e) {
          if(e.name !== 'NotFoundError') {
            throw e;
          }
          // mapping record now not found, loop to try again
          continue;
        }

        try {
          // find the config record, allow it to be pending
          const {config: {id: existingConfigId}, meta} = await get(
            {id: mappingRecord.configId, _allowPending: true});
          // if existing config record found in pending status, remove it...
          // a race is on to determine which config record wins
          if(meta.state === 'pending') {
            if(await collection.removeOne(
              {'config.id': existingConfigId, 'meta.state': 'pending'})) {
              // old pending config record removed, now remove existing mapping
              await referenceIds.remove(mappingRecord);
            }
            // loop to try again since old config record was pending
            continue;
          }
        } catch(e) {
          if(e.name !== 'NotFoundError') {
            throw e;
          }
          // existing config record not found, so remove reference ID
          // mapping record and try again
          await referenceIds.remove(mappingRecord);
          continue;
        }
      }

      // remove the pending record and re-throw the duplicate error
      await remove({id: configId});
      throw e;
    }

    // no duplicate error, so removing pending state from config record, noting
    // that another process could remove the pending state first, which is
    // not an error
    delete configRecord.meta.state;
    if(!await collection.updateOne(
      {'config.id': config.id, 'meta.state': 'pending'},
      {$unset: {'meta.state': ''}})) {
      // if the record wasn't updated, then it was removed by another process
      // that claimed the controller + reference ID, loop and try again
      continue;
    }
    // successfully claimed controller + reference ID
    return configRecord;
  }
}
