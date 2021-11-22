/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const assert = require('assert-plus');
const bedrock = require('bedrock');
const database = require('bedrock-mongodb');
const {util: {BedrockError}} = bedrock;

// module API
const api = {};
module.exports = api;

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
    // ensure config uniqueness of reference ID per controller
    collection: COLLECTION_NAME,
    fields: {'config.controller': 1, 'config.referenceId': 1},
    options: {
      partialFilterExpression: {
        'config.referenceId': {$exists: true}
      },
      unique: true,
      background: false
    }
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
 * @param {Object} config the EDV configuration.
 *
 * @return {Promise<Object>} resolves to the database record.
 */
api.insert = async ({config}) => {
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

  // TODO: enable optional primary `keyAgreementKey` and `hmac` in the future
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

  // insert the configuration and get the updated record
  const now = Date.now();
  const meta = {created: now, updated: now};
  const record = {
    meta,
    config
  };
  try {
    const collection = database.collections[COLLECTION_NAME];
    const result = await collection.insertOne(record);
    return result.ops[0];
  } catch(e) {
    if(!database.isDuplicateError(e)) {
      throw e;
    }
    throw new BedrockError(
      'Duplicate configuration.',
      'DuplicateError', {
        public: true,
        httpStatusCode: 409
      }, e);
  }
};

/**
 * Retrieves all EDV configs matching the given query.
 *
 * @param {string} controller the controller for the EDVs to retrieve.
 * @param {Object} [query={}] the optional query to use.
 * @param {Object} [options={}] options (eg: 'sort', 'limit').
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @return {Promise<Array> | ExplainObject} resolves to the records that
 *   matched the query or an ExplainObject if `explain=true`.
 */
api.find = async ({
  controller, query = {}, options = {}, explain = false
} = {}) => {
  // force controller ID
  query['config.controller'] = controller;
  const collection = database.collections[COLLECTION_NAME];
  const cursor = await collection.find(query, options);

  if(explain) {
    return cursor.explain('executionStats');
  }

  return cursor.toArray();
};

/**
 * Updates an EDV config if its sequence number is next.
 *
 * @param {Object} config the EDV configuration.
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @return {Promise<Object> | ExplainObject} resolves to the database record or
 *   an ExplainObject if `explain=true`.
 */
api.update = async ({config, explain = false} = {}) => {
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
};

/**
 * Gets an EDV configuration.
 *
 * @param {string} id the ID of the EDV.
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @return {Promise<Object> | ExplainObject} resolves to `{config, meta}` or
 *   an ExplainObject if `explain=true`.
 */
api.get = async ({id, explain = false} = {}) => {
  assert.string(id, 'id');

  const collection = database.collections[COLLECTION_NAME];
  const query = {'config.id': id};
  const projection = {_id: 0, config: 1, meta: 1};

  if(explain) {
    // 'find().limit(1)' is used here because 'updateOne()' doesn't return a
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
};
