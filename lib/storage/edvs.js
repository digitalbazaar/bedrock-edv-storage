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

bedrock.events.on('bedrock-mongodb.ready', async () => {
  await database.openCollections(['edvConfig']);

  await database.createIndexes([{
    // cover queries config by ID
    collection: 'edvConfig',
    fields: {id: 1},
    options: {unique: true, background: false}
  }, {
    // cover config queries by controller
    collection: 'edvConfig',
    fields: {controller: 1},
    options: {unique: false, background: false}
  }, {
    // ensure config uniqueness of reference ID per controller
    collection: 'edvConfig',
    fields: {controller: 1, 'config.referenceId': 1},
    options: {
      partialFilterExpression: {
        'config.referenceId': {$exists: true}
      },
      unique: true,
      background: false
    }
  }]);
});

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

  // FIXME: remove database.hash() and use `localId` for config ID

  // insert the configuration and get the updated record
  const now = Date.now();
  const meta = {created: now, updated: now};
  const record = {
    id: database.hash(config.id),
    controller: database.hash(config.controller),
    meta,
    config
  };
  try {
    const result = await database.collections.edvConfig.insertOne(
      record, database.writeOptions);
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
 *
 * @return {Promise<Array>} resolves to the records that matched the query.
 */
api.find = async ({controller, query = {}, options = {}}) => {
  // force controller ID
  query.controller = database.hash(controller);
  return database.collections.edvConfig.find(query, options).toArray();
};

/**
 * Updates an EDV config if its sequence number is next.
 *
 * @param {Object} config the EDV configuration.
 *
 * @return {Promise<Object>} resolves to the database record.
 */
api.update = async ({config}) => {
  assert.object(config, 'config');
  assert.string(config.id, 'config.id');
  assert.number(config.sequence, config.sequence);
  assert.string(config.controller, 'config.controller');

  // insert the configuration and get the updated record
  const now = Date.now();

  const result = await database.collections.edvConfig.updateOne({
    id: database.hash(config.id),
    'config.sequence': config.sequence - 1
  }, {
    $set: {
      config,
      controller: database.hash(config.controller),
      'meta.updated': now
    }
  }, database.writeOptions);

  if(result.result.n === 0) {
    // no records changed...
    throw new BedrockError(
      'Could not update configuration. ' +
      'Record sequence does not match or keystore does not exist.',
      'InvalidStateError', {httpStatusCode: 409, public: true});
  }

  return true;
};

/**
 * Gets an EDV configuration.
 *
 * @param {string} id the ID of the EDV.
 *
 * @return {Promise<Object>} resolves to `{config, meta}`.
 */
api.get = async ({id}) => {
  assert.string(id, 'id');

  const record = await database.collections.edvConfig.findOne(
    {id: database.hash(id)},
    {projection: {_id: 0, config: 1, meta: 1}});
  if(!record) {
    throw new BedrockError(
      'Configuration not found.',
      'NotFoundError',
      {edv: id, httpStatusCode: 404, public: true});
  }

  return record;
};
