/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const assert = require('assert-plus');
const {assert128BitId, decodeLocalId, parseLocalId} = require('../helpers');
const bedrock = require('bedrock');
const database = require('bedrock-mongodb');
const docs = require('./docs.js');
const {util: {BedrockError}} = bedrock;

// module API
const api = {};
module.exports = api;

const COLLECTION_NAME = 'edv-storage-chunk';

bedrock.events.on('bedrock-mongodb.ready', async () => {
  await database.openCollections([COLLECTION_NAME]);

  await database.createIndexes([{
    // cover document queries by EDV ID + document ID + chunk.index
    collection: COLLECTION_NAME,
    fields: {localEdvId: 1, docId: 1, 'chunk.index': 1},
    options: {unique: true, background: false}
  }]);
});

/**
 * An object containing information on the query plan.
 *
 * @typedef {object} ExplainObject
 */

/**
 * Updates (replaces) an EDV document chunk. If the document chunk does not
 * exist, it will be inserted.
 *
 * @param {string} edvId the ID of the EDV the document chunk is in.
 * @param {string} docId the ID of the document the chunk is associated with.
 * @param {Object} chunk the chunk to store.
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @returns {Promise<boolean | ExplainObject>} Resolves with `true` on update
 *   success or an ExplainObject if `explain=true`.
 */
api.update = async ({edvId, docId, chunk, explain = false} = {}) => {
  assert.string(edvId, 'edvId');
  assert.string(docId, 'docId');
  assert128BitId(docId);
  assert.object(chunk, 'chunk');
  assert.number(chunk.index, 'chunk.index');
  // TODO: what's the max offset here? Number.MAX_SAFE_INTEGER?
  assert.number(chunk.offset, 'chunk.offset');
  assert.number(chunk.sequence, 'chunk.sequence');
  assert.object(chunk.jwe, 'chunk.jwe');

  if(!(chunk.index >= 0 && Number.isInteger(chunk.index))) {
    throw new TypeError('"chunk.index" must be a non-negative integer.');
  }
  if(!(chunk.offset >= 0 && Number.isInteger(chunk.offset))) {
    throw new TypeError('"chunk.offset" must be a non-negative integer.');
  }
  if(!(chunk.sequence >= 0 && Number.isInteger(chunk.sequence))) {
    throw new TypeError('"chunk.sequence" must be a non-negative integer.');
  }

  // TODO: implement garbage collector worker that removes chunks with stale
  // sequences (e.g., can happen because uploads failed or because associated
  // data shrunk in size, i.e., fewer chunks)

  // ensure `chunk.sequence` is proper (on par with associated doc)
  // TODO: optimize retrieval of only sequence number
  const {doc} = await docs.get({edvId, id: docId});
  if(chunk.sequence !== doc.sequence) {
    throw new BedrockError(
      'Could not update document chunk. Sequence does not match ' +
      'associated document.', 'InvalidStateError', {
        httpStatusCode: 409,
        public: true,
        expected: doc.sequence,
        actual: chunk.sequence
      });
  }

  const now = Date.now();
  const meta = {created: now, updated: now};
  const {localId: localEdvId} = parseLocalId({id: edvId});
  const record = {
    localEdvId,
    docId: decodeLocalId({localId: docId}),
    meta,
    chunk
  };

  const collection = database.collections[COLLECTION_NAME];
  const query = {
    localEdvId,
    docId: record.docId,
    'chunk.index': chunk.index
  };

  if(explain) {
    // 'find().limit(1)' is used here because 'updateOne()' doesn't return a
    // cursor which allows the use of the explain function.
    const cursor = await collection.find(query).limit(1);
    return cursor.explain('executionStats');
  }

  try {
    const result = await collection.updateOne(query, {
      $set: {chunk, 'meta.updated': now},
      $setOnInsert: {
        localEdvId,
        docId: record.docId,
        'meta.created': now
      }
    }, {...database.writeOptions, upsert: true});

    if(result.result.n > 0) {
      // document chunk upserted or modified: success
      return true;
    }
  } catch(e) {
    if(!database.isDuplicateError(e)) {
      throw e;
    }
    throw new BedrockError(
      'Duplicate document chunk.',
      'DuplicateError', {
        public: true,
        httpStatusCode: 409
      }, e);
  }

  // the only way this code is reachable is if the chunk did not change
  // and that an update call happened concurrently/so quickly that
  // `meta.updated` did not change
  return true;
};

/**
 * Gets an EDV document chunk.
 *
 * @param {string} edvId the ID of the EDV that the document is in.
 * @param {string} docId the ID of the document the chunk is associated with.
 * @param {number} chunkIndex the index of the chunk.
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @returns {Promise<Object | ExplainObject>} Resolves with the record that
 *   matches the query or an ExplainObject if `explain=true`.
 */
api.get = async ({edvId, docId, chunkIndex, explain = false} = {}) => {
  assert.string(edvId, 'edvId');
  assert.string(docId, 'docId');
  assert128BitId(docId);
  assert.number(chunkIndex, 'chunkIndex');
  if(!(chunkIndex >= 0 && Number.isInteger(chunkIndex))) {
    throw new TypeError('"chunk.index" must be a non-negative integer.');
  }

  const {localId: localEdvId} = parseLocalId({id: edvId});
  const collection = database.collections[COLLECTION_NAME];
  const query = {
    localEdvId,
    docId: decodeLocalId({localId: docId}),
    'chunk.index': chunkIndex
  };
  const projection = {_id: 0, chunk: 1, meta: 1};

  if(explain) {
    // 'find().limit(1)' is used here because 'findOne()' doesn't return a
    // cursor which allows the use of the explain function.
    const cursor = await collection.find(query, {projection}).limit(1);
    return cursor.explain('executionStats');
  }

  const record = await collection.findOne(query, {projection});
  if(!record) {
    throw new BedrockError(
      'Document chunk not found.',
      'NotFoundError', {
        edv: edvId, doc: docId, chunkIndex,
        httpStatusCode: 404, public: true
      });
  }

  return record;
};

/**
 * Removes an EDV document chunk.
 *
 * @param {string} edvId the ID of the EDV the document is in.
 * @param {string} docId the ID of the document the chunk is associated with.
 * @param {number} chunkIndex the index of the chunk to remove.
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @return {Promise<Boolean> | ExplainObject} Resolves with `true` if a document
 *   chunk was removed and `false` if not or an ExplainObject if `explain=true`.
 */
api.remove = async ({edvId, docId, chunkIndex, explain = false} = {}) => {
  assert.string(edvId, 'edvId');
  assert.string(docId, 'docId');
  assert128BitId(docId);
  assert.number(chunkIndex, 'chunkIndex');
  if(!(chunkIndex >= 0 && Number.isInteger(chunkIndex))) {
    throw new TypeError('"chunk.index" must be a non-negative integer.');
  }

  const {localId: localEdvId} = parseLocalId({id: edvId});
  const collection = database.collections[COLLECTION_NAME];
  const query = {
    localEdvId,
    docId: decodeLocalId({localId: docId}),
    'chunk.index': chunkIndex
  };

  if(explain) {
    // 'find().limit(1)' is used here because 'deleteOne()' doesn't return a
    // cursor which allows the use of the explain function.
    const cursor = await collection.find(query).limit(1);
    return cursor.explain('executionStats');
  }

  const result = await collection.deleteOne(query);
  return result.result.n !== 0;
};

/**
 * Gets the total size, in bytes, for chunks in a given EDV.
 *
 * @param {object} options - The options to use.
 * @param {string} options.edvId - The ID of the EDV.
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @return {Promise<object | ExplainObject>} Resolves with the total size
 *   information for records that matched the query or returns an ExplainObject
 *   if `explain=true`.
 */
api.getTotalSize = async ({edvId, explain = false} = {}) => {
  const {localId: localEdvId} = parseLocalId({id: edvId});
  const collection = database.collections[COLLECTION_NAME];

  const cursor = collection.aggregate([{
    $match: {localEdvId}
  }, {
    $group: {
      _id: null,
      size: {
        // sum the entire document
        $sum: {$bsonSize: '$$ROOT'}
      }
    }
  }]);

  if(explain) {
    return cursor.explain('executionStats');
  }

  const [{size}] = await cursor.toArray();
  return {size};
};
