/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const assert = require('assert-plus');
const {assert128BitId} = require('./helpers');
const bedrock = require('bedrock');
const database = require('bedrock-mongodb');
const docs = require('./docs');
const {util: {BedrockError}} = bedrock;

// module API
const api = {};
module.exports = api;

bedrock.events.on('bedrock-mongodb.ready', async () => {
  await database.openCollections(['edvDocChunk']);

  await database.createIndexes([{
    // cover document queries by EDV ID + document ID + chunk.index
    collection: 'edvDocChunk',
    fields: {edvId: 1, docId: 1, 'chunk.index': 1},
    options: {unique: true, background: false}
  }]);
});

/**
 * Updates (replaces) an EDV document chunk. If the document chunk does not
 * exist, it will be inserted.
 *
 * @param {string} edvId the ID of the EDV the document chunk is in.
 * @param {string} docId the ID of the document the chunk is associated with.
 * @param {Object} chunk the chunk to store.
 *
 * @return {Promise} resolves once the operation completes.
 */
api.update = async ({edvId, docId, chunk}) => {
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
      'Could not update document chunk. Sequence does not match.',
      'InvalidStateError', {
        httpStatusCode: 409,
        public: true,
        expected: doc.sequence,
        actual: chunk.sequence
      });
  }

  const now = Date.now();
  const meta = {created: now, updated: now};
  const record = {
    edvId: database.hash(edvId),
    docId: database.hash(docId),
    meta,
    chunk
  };

  try {
    const result = await database.collections.edvDocChunk.updateOne({
      edvId: record.edvId,
      docId: record.docId,
      'chunk.index': chunk.index
    }, {
      $set: {chunk, 'meta.updated': now},
      $setOnInsert: {
        edvId: record.edvId, docId: record.docId,
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

  throw new BedrockError(
    'Could not update document chunk. Sequence does not match ' +
    'associated document.',
    'InvalidStateError', {
      httpStatusCode: 409,
      public: true,
      expected: doc.sequence
    });
};

/**
 * Gets an EDV document chunk.
 *
 * @param {string} edvId the ID of the EDV that the document is in.
 * @param {string} docId the ID of the document the chunk is associated with.
 * @param {number} chunkIndex the index of the chunk.
 *
 * @return {Promise<Object>} resolves to `{chunk, meta}`.
 */
api.get = async ({edvId, docId, chunkIndex}) => {
  assert.string(edvId, 'edvId');
  assert.string(docId, 'docId');
  assert128BitId(docId);
  assert.number(chunkIndex, 'chunkIndex');
  if(!(chunkIndex >= 0 && Number.isInteger(chunkIndex))) {
    throw new TypeError('"chunk.index" must be a non-negative integer.');
  }

  // TODO: store chunks as files instead of documents
  const record = await database.collections.edvDocChunk.findOne({
    edvId: database.hash(edvId), docId: database.hash(docId),
    'chunk.index': chunkIndex
  }, {projection: {_id: 0, chunk: 1, meta: 1}});
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
 *
 * @return {Promise<Boolean>} resolves to `true` if a document chunk was
 *   removed and `false` if not.
 */
api.remove = async ({edvId, docId, chunkIndex}) => {
  assert.string(edvId, 'edvId');
  assert.string(docId, 'docId');
  assert128BitId(docId);
  assert.number(chunkIndex, 'chunkIndex');
  if(!(chunkIndex >= 0 && Number.isInteger(chunkIndex))) {
    throw new TypeError('"chunk.index" must be a non-negative integer.');
  }

  // TODO: store chunks as files instead of documents
  const result = await database.collections.edvDocChunk.deleteOne({
    edvId: database.hash(edvId), docId: database.hash(docId),
    'chunk.index': chunkIndex
  });
  return result.result.n !== 0;
};
