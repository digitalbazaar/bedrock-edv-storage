/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const assert = require('assert-plus');
const {
  assert128BitId, parseLocalId, validateDocSequence
} = require('../helpers');
const bedrock = require('bedrock');
const database = require('bedrock-mongodb');
const {util: {BedrockError}} = bedrock;

// module API
const api = {};
module.exports = api;

const COLLECTION_NAME = 'edv-storage-doc';

bedrock.events.on('bedrock-mongodb.ready', async () => {
  await database.openCollections([COLLECTION_NAME]);

  await database.createIndexes([{
    // cover document queries by EDV ID + document ID
    collection: COLLECTION_NAME,
    fields: {localEdvId: 1, 'doc.id': 1},
    options: {unique: true, background: false}
  }, {
    // cover document attribute-based queries
    collection: COLLECTION_NAME,
    fields: {
      localEdvId: 1,
      'doc.indexed.hmac.id': 1,
      'doc.indexed.attributes.name': 1,
      'doc.indexed.attributes.value': 1
    },
    options: {
      name: 'attributes',
      partialFilterExpression: {
        'doc.indexed': {$exists: true},
        'doc.indexed.hmac.id': {$exists: true},
        'doc.indexed.attributes.name': {$exists: true}
      },
      unique: false,
      background: false
    },
  }, {
    // ensure document unique attributes are enforced
    collection: COLLECTION_NAME,
    fields: {
      localEdvId: 1,
      uniqueAttributes: 1
    },
    options: {
      name: 'attributes.unique',
      partialFilterExpression: {
        uniqueAttributes: {$exists: true}
      },
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
 * Inserts an EDV document.
 *
 * @param {string} id the ID of the EDV to store the document in.
 * @param {Object} doc the document to insert.
 *
 * @return {Promise<Object>} resolves to the database record.
 */
api.insert = async ({edvId, doc}) => {
  assert.string(edvId, 'edvId');
  assert.object(doc, 'doc');
  assert.string(doc.id, 'doc.id');
  assert128BitId(doc.id);
  assert.number(doc.sequence, 'doc.sequence');
  validateDocSequence(doc.sequence);
  assert.object(doc.jwe, 'doc.jwe');
  assert.optionalArray(doc.indexed, 'doc.indexed');

  // insert the doc and get the updated record
  const now = Date.now();
  const meta = {created: now, updated: now};
  const {localId: localEdvId} = parseLocalId({id: edvId});
  const record = {
    localEdvId,
    meta,
    doc
  };

  // build top-level unique index field
  const uniqueAttributes = _buildUniqueAttributesIndex(doc);
  if(uniqueAttributes.length > 0) {
    record.uniqueAttributes = uniqueAttributes;
  }

  try {
    const collection = database.collections[COLLECTION_NAME];
    const result = await collection.insertOne(record);
    return result.ops[0];
  } catch(e) {
    if(!database.isDuplicateError(e)) {
      throw e;
    }
    throw new BedrockError(
      'Duplicate document.',
      'DuplicateError', {
        public: true,
        httpStatusCode: 409
      }, e);
  }
};

/**
 * Gets an EDV document.
 *
 * @param {string} edvId the ID of the EDV that the document is in.
 * @param {string} id the ID of the document to retrieve.
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @return {Promise<Object | ExplainObject>} Resolves with the record that
 *   matches the query or an ExplainObject if `explain=true`.
 */
api.get = async ({edvId, id, explain = false} = {}) => {
  assert.string(edvId, 'edvId');
  assert.string(id, 'id');
  assert128BitId(id);

  const {localId: localEdvId} = parseLocalId({id: edvId});
  const collection = database.collections[COLLECTION_NAME];
  const query = {localEdvId, 'doc.id': id};
  const projection = {_id: 0, doc: 1, meta: 1};

  if(explain) {
    // 'find().limit(1)' is used here because 'findOne()' doesn't return a
    // cursor which allows the use of the explain function.
    const cursor = await collection.find(query, {projection}).limit(1);
    return cursor.explain('executionStats');
  }

  const record = await collection.findOne(query, {projection});
  if(!record) {
    throw new BedrockError(
      'Document not found.',
      'NotFoundError',
      {edv: edvId, doc: id, httpStatusCode: 404, public: true});
  }

  return record;
};

/**
 * Retrieves all EDV documents matching the given query.
 *
 * @param {string} edvId the ID of the EDV to query.
 * @param {Object} query the optional query to use (default: {}).
 * @param {Object} [options={}] options (eg: 'sort', 'limit').
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @return {Promise<Array | ExplainObject>} Resolves with the records that
 *   matched the query or returns an ExplainObject if `explain=true`.
 */
api.find = async ({edvId, query = {}, options = {}, explain = false}) => {
  // force local EDV ID to be in query
  const {localId: localEdvId} = parseLocalId({id: edvId});
  query.localEdvId = localEdvId;
  const collection = database.collections[COLLECTION_NAME];

  if(explain) {
    const cursor = await collection.find(query, options);
    return cursor.explain('executionStats');
  }

  const documents = await collection.find(query, options).toArray();
  return {documents};
};

api.count = async ({edvId, query = {}, options = {}, explain = false} = {}) => {
  // force EDV ID to be in query
  const {localId: localEdvId} = parseLocalId({id: edvId});
  query.localEdvId = localEdvId;
  const collection = database.collections[COLLECTION_NAME];

  if(explain) {
    // 'find()' is used here because 'countDocuments()' doesn't return a
    // cursor which allows the use of the explain function.
    const cursor = await collection.find(query, options);
    return cursor.explain('executionStats');
  }

  return collection.countDocuments(query, options);
};

/**
 * Updates (replaces) an EDV document. If the document does not exist,
 * it will be inserted. See `insert`.
 *
 * @param {string} edvId the ID of the EDV the document is in.
 * @param {Object} doc the document to store.
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @returns {Promise<boolean | ExplainObject>} Resolves with `true` on update
 *   success or an ExplainObject if `explain=true`.
 */
api.update = async ({edvId, doc, explain = false} = {}) => {
  assert.string(edvId, 'edvId');
  assert.object(doc, 'doc');
  assert.string(doc.id, 'doc.id');
  assert128BitId(doc.id);
  assert.number(doc.sequence, 'doc.sequence');
  validateDocSequence(doc.sequence);
  assert.object(doc.jwe, 'doc.jwe');
  assert.optionalArray(doc.indexed, 'doc.indexed');

  // build update
  const now = Date.now();
  const update = {};
  update.$set = {doc, 'meta.updated': now};

  // build top-level unique index field
  const uniqueAttributes = _buildUniqueAttributesIndex(doc);
  if(uniqueAttributes.length > 0) {
    update.$set.uniqueAttributes = uniqueAttributes;
  } else {
    update.$unset = {uniqueAttributes: true};
  }

  // add insert-only fields
  const {localId: localEdvId} = parseLocalId({id: edvId});
  update.$setOnInsert = {localEdvId, 'meta.created': now};

  const collection = database.collections[COLLECTION_NAME];
  const query = {
    localEdvId,
    'doc.id': doc.id,
    'doc.sequence': doc.sequence - 1
  };

  if(explain) {
    // 'find().limit(1)' is used here because 'updateOne()' doesn't return a
    // cursor which allows the use of the explain function.
    const cursor = await collection.find(query).limit(1);
    return cursor.explain('executionStats');
  }

  try {
    const result = await collection.updateOne(
      query, update, {...database.writeOptions, upsert: true});

    if(result.result.n > 0) {
      // document upserted or modified: success
      return true;
    }
  } catch(e) {
    if(!database.isDuplicateError(e)) {
      throw e;
    }
    throw new BedrockError(
      'Duplicate document.',
      'DuplicateError', {
        public: true,
        httpStatusCode: 409
      }, e);
  }

  throw new BedrockError(
    'Could not update document. Sequence does not match.',
    'InvalidStateError', {
      httpStatusCode: 409,
      public: true,
      expected: doc.sequence
    });
};

/**
 * Gets the total size, in bytes, for documents in a given EDV.
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

  const [{size = 0} = {}] = await cursor.toArray();
  return {size};
};

function _buildUniqueAttributesIndex(doc) {
  const uniqueAttributes = [];

  // build top-level unique index field
  if(doc.indexed) {
    for(const entry of doc.indexed) {
      const hmacIdHash = database.hash(entry.hmac.id);
      const attributes = entry.attributes || [];
      for(const attribute of attributes) {
        if(attribute.unique) {
          // concat hash of hmac ID, name, and value for unique indexing
          uniqueAttributes.push(
            `${hmacIdHash}:${attribute.name}:${attribute.value}`);
        }
      }
    }
  }

  return uniqueAttributes;
}
