/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as database from '@bedrock/mongodb';
import assert from 'assert-plus';

const {util: {BedrockError}} = bedrock;

const COLLECTION_NAME = 'edv-storage-referenceId';

bedrock.events.on('bedrock-mongodb.ready', async () => {
  await database.openCollections([COLLECTION_NAME]);

  await database.createIndexes([{
    // ensure controller + reference IDs are unique
    collection: COLLECTION_NAME,
    fields: {controller: 1, referenceId: 1},
    options: {
      unique: true,
      background: false
    }
  }]);
});

/**
 * An object containing information on the query plan.
 *
 * @typedef {object} ExplainObject
 */

/**
 * Inserts a unique controller + reference ID mapping to a config ID.
 *
 * @param {object} options - The options to use.
 * @param {string} options.controller - The controller.
 * @param {string} options.referenceId - The reference ID.
 * @param {string} options.configId - The config ID.
 *
 * @returns {Promise<object>} Resolves to the database record.
 */
export async function insert({controller, referenceId, configId} = {}) {
  assert.string(controller, 'controller');
  assert.string(referenceId, 'referenceId');
  assert.string(configId, 'configId');

  // insert the mapping
  const record = {controller, referenceId, configId};

  try {
    const collection = database.collections[COLLECTION_NAME];
    const result = await collection.insertOne(record);
    return result.ops[0];
  } catch(e) {
    if(!database.isDuplicateError(e)) {
      throw e;
    }
    // intentionally surface as a duplicate config error
    // (not just a duplicate mapping error)
    throw new BedrockError('Duplicate configuration.', {
      name: 'DuplicateError',
      details: {
        configId, controller, referenceId, public: true, httpStatusCode: 409
      },
      cause: e
    });
  }
}

/**
 * Gets a controller + reference ID mapping.
 *
 * @param {object} options - The options to use.
 * @param {string} options.controller - The controller.
 * @param {string} options.referenceId - The reference ID to get.
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @returns {Promise<object | ExplainObject>} Resolves with the record that
 *   matches the query or an ExplainObject if `explain=true`.
 */
export async function get({controller, referenceId, explain = false} = {}) {
  assert.string(controller, 'controller');
  assert.string(referenceId, 'referenceId');

  const collection = database.collections[COLLECTION_NAME];
  const query = {controller, referenceId};
  const projection = {_id: 0, controller, referenceId, configId: 1};

  if(explain) {
    // 'find().limit(1)' is used here because 'findOne()' doesn't return a
    // cursor which allows the use of the explain function
    const cursor = await collection.find(query, {projection}).limit(1);
    return cursor.explain('executionStats');
  }

  const record = await collection.findOne(query, {projection});
  if(!record) {
    throw new BedrockError('Reference ID not found.', {
      name: 'NotFoundError',
      details: {controller, referenceId, httpStatusCode: 404, public: true}
    });
  }

  return record;
}

/**
 * Removes an existing mapping.
 *
 * @param {object} options - The options to use.
 * @param {string} options.controller - The controller.
 * @param {string} options.referenceId - The reference ID to remove.
 * @param {string} options.configId - The config ID.
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @returns {Promise<boolean | ExplainObject>} Resolves with `true` on remove
 *   success or an ExplainObject if `explain=true`.
 */
export async function remove({
  controller, referenceId, configId, explain = false
} = {}) {
  assert.string(controller, 'controller');
  assert.string(referenceId, 'referenceId');
  assert.string(configId, 'configId');

  const collection = database.collections[COLLECTION_NAME];
  const query = {controller, referenceId, configId};

  if(explain) {
    // 'find().limit(1)' is used here because 'deleteOne()' doesn't return a
    // cursor which allows the use of the explain function
    const cursor = await collection.find(query).limit(1);
    return cursor.explain('executionStats');
  }

  const result = await collection.deleteOne(query);
  return result.result.n > 0;
}
