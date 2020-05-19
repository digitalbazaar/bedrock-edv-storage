/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

require('bedrock-account');
const assert = require('assert-plus');
const base58 = require('bs58');
const bedrock = require('bedrock');
const database = require('bedrock-mongodb');
const brPermission = require('bedrock-permission');
const {promisify} = require('util');
const logger = require('./logger');
const brPermissionCheck = promisify(brPermission.checkPermission);
const {util: {BedrockError}} = bedrock;

// module API
const api = {};
module.exports = api;

const PERMISSIONS = bedrock.config.permission.permissions;

bedrock.events.on('bedrock-mongodb.ready', async () => {
  await promisify(database.openCollections)(
    ['edvConfig', 'edvDoc', 'edvDocChunk']);

  await promisify(database.createIndexes)([{
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
        'config.referenceId': true
      },
      unique: true,
      background: false
    }
  }, {
    // cover document queries by EDV ID + document ID
    collection: 'edvDoc',
    fields: {edvId: 1, id: 1},
    options: {unique: true, background: false}
  }, {
    // cover document attribute-based queries
    collection: 'edvDoc',
    fields: {
      edvId: 1,
      'doc.indexed.hmac.id': 1,
      'doc.indexed.attributes.name': 1,
      'doc.indexed.attributes.value': 1
    },
    options: {
      name: 'edvDoc.attributes',
      partialFilterExpression: {
        // FIXME: can/should this be consolidated?
        'doc.indexed': {$exists: true},
        'doc.indexed.hmac.id': {$exists: true},
        'doc.indexed.attributes.name': {$exists: true}
      },
      unique: false,
      background: false
    },
  }, {
    // ensure document unique attributes are enforced
    collection: 'edvDoc',
    fields: {
      edvId: 1,
      uniqueAttributes: 1
    },
    options: {
      name: 'edvDoc.attributes.unique',
      partialFilterExpression: {
        uniqueAttributes: {$exists: true}
      },
      unique: true,
      background: false
    }
  }, {
    // cover document queries by EDV ID + document ID + chunk.index
    collection: 'edvDocChunk',
    fields: {edvId: 1, docId: 1, 'chunk.index': 1},
    options: {unique: true, background: false}
  }]);
});

/**
 * Establishes a new EDV by inserting its configuration into storage.
 *
 * @param {Object} actor the actor or capabilities for performing the action.
 * @param {Object} config the EDV configuration.
 *
 * @return {Promise<Object>} resolves to the database record.
 */
api.insertConfig = async ({actor, config}) => {
  assert.object(config, 'config');
  assert.string(config.id, 'config.id');
  assert.string(config.controller, 'config.controller');

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

  // check permission against controller ID
  const {controller} = config;
  await brPermissionCheck(
    actor, PERMISSIONS.EDV_CONFIG_UPDATE,
    {resource: [controller]});

  // insert the configuration and get the updated record
  const now = Date.now();
  const meta = {created: now, updated: now};
  const record = {
    id: database.hash(config.id),
    controller: database.hash(controller),
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
 * @param {Object} actor the actor or capabilities for performing the action.
 * @param {string} controller the controller for the EDVs to retrieve.
 * @param {Object} query the optional query to use (default: {}).
 * @param {Object} fields optional fields to include or exclude (default: {}).
 * @param {Object} options options (eg: 'sort', 'limit').
 *
 * @return {Promise<Array>} resolves to the records that matched the query.
 */
api.findConfig = async (
  {actor, controller, query = {}, fields = {}, options = {}}) => {
  // check permission against any EDV matching the controller
  await brPermissionCheck(
    actor, PERMISSIONS.EDV_CONFIG_ACCESS,
    {resource: [controller]});

  // force controller ID
  query.controller = database.hash(controller);
  // FIXME remove options.fields from all libraries that call on this method
  // instead use options.projection
  if(fields) {
    logger.info('The parameter fields in method findConfig is being ' +
      'deprecated please use options.projection instead');
  }
  options.projection = options.projection || fields;
  return database.collections.edvConfig.find(query, options).toArray();
};

/**
 * Updates an EDV config if its sequence number is next.
 *
 * @param {Object} actor the actor or capabilities for performing the action.
 * @param {Object} config the EDV configuration.
 *
 * @return {Promise<Object>} resolves to the database record.
 */
api.updateConfig = async ({actor, config}) => {
  assert.object(config, 'config');
  assert.string(config.id, 'config.id');
  assert.number(config.sequence, config.sequence);
  assert.string(config.controller, 'config.controller');

  // check permission against controller ID
  const {controller} = config;
  await brPermissionCheck(
    actor, PERMISSIONS.EDV_CONFIG_UPDATE,
    {resource: [controller]});

  // insert the configuration and get the updated record
  const now = Date.now();

  const result = await database.collections.edvConfig.updateOne({
    id: database.hash(config.id),
    'config.sequence': config.sequence - 1
  }, {
    $set: {
      config,
      controller: database.hash(controller),
      'meta.updated': now
    }
  }, database.writeOptions);

  if(result.result.n === 0) {
    // no records changed...
    return new BedrockError(
      'Could not update configuration. ' +
      'Record sequence does not match or keystore does not exist.',
      'InvalidStateError', {httpStatusCode: 409, public: true});
  }

  return true;
};

/**
 * Gets an EDV configuration.
 *
 * @param {Object} actor the actor or capabilities for performing the action.
 * @param {string} id the ID of the EDV.
 *
 * @return {Promise<Object>} resolves to `{config, meta}`.
 */
api.getConfig = async ({actor, id}) => {
  assert.string(id, 'id');

  const record = await database.collections.edvConfig.findOne(
    {id: database.hash(id)},
    {_id: 0, config: 1, meta: 1});
  if(!record) {
    throw new BedrockError(
      'Configuration not found.',
      'NotFoundError',
      {edv: id, httpStatusCode: 404, public: true});
  }

  // check permission against EDV directly or its controller
  await brPermissionCheck(
    actor, PERMISSIONS.EDV_CONFIG_ACCESS,
    {resource: [record.config.id, record.config.controller]});

  return record;
};

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
  _assert128BitId(doc.id);
  assert.number(doc.sequence, 'doc.sequence');
  assert.object(doc.jwe, 'doc.jwe');
  assert.optionalArray(doc.indexed, 'doc.indexed');

  // Note: `doc.sequence === 0` is intentionally not enforced at this time
  // to allow for easier copying of documents from other EDVs, this
  // may change in the future
  if(doc.sequence < 0) {
    throw new TypeError('"doc.sequence" must be a non-negative integer.');
  }

  // insert the doc and get the updated record
  const now = Date.now();
  const meta = {created: now, updated: now};
  const record = {
    edvId: database.hash(edvId),
    id: database.hash(doc.id),
    meta,
    doc
  };

  // build top-level unique index field
  const uniqueAttributes = _buildUniqueAttributesIndex(doc);
  if(uniqueAttributes.length > 0) {
    record.uniqueAttributes = uniqueAttributes;
  }

  try {
    const result = await database.collections.edvDoc.insertOne(
      record, database.writeOptions);
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
 *
 * @return {Promise<Object>} resolves to `{doc, meta}`.
 */
api.get = async ({edvId, id}) => {
  assert.string(edvId, 'edvId');
  assert.string(id, 'id');
  _assert128BitId(id);

  const record = await database.collections.edvDoc.findOne(
    {edvId: database.hash(edvId), id: database.hash(id)},
    {_id: 0, doc: 1, meta: 1});
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
 * @param {Object} fields optional fields to include or exclude (default: {}).
 * @param {Object} options options (eg: 'sort', 'limit').
 *
 * @return {Promise<Array>} resolves to the records that matched the query.
 */
api.find = async ({edvId, query = {}, fields = {}, options = {}}) => {
  // force EDV ID
  query.edvId = database.hash(edvId);
  // FIXME remove options.fields from all libraries that call on bedrock-account
  // instead use options.projection
  if(fields) {
    logger.info('The parameter fields in method find is being deprecated' +
      'please use options.projection instead');
  }
  options.projection = options.projection || fields;
  return database.collections.edvDoc.find(query, options).toArray();
};

api.count = async ({edvId, query = {}, options = {}}) => {
  // force EDV ID
  query.edvId = database.hash(edvId);
  return database.collections.edvDoc.countDocuments(query, options);
};

/**
 * Updates (replaces) an EDV document. If the document does not exist,
 * it will be inserted. See `insert`.
 *
 * @param {string} edvId the ID of the EDV the document is in.
 * @param {Object} doc the document to store.
 *
 * @return {Promise} resolves once the operation completes.
 */
api.update = async ({edvId, doc}) => {
  assert.string(edvId, 'edvId');
  assert.object(doc, 'doc');
  assert.string(doc.id, 'doc.id');
  _assert128BitId(doc.id);
  assert.number(doc.sequence, 'doc.sequence');
  assert.object(doc.jwe, 'doc.jwe');
  assert.optionalArray(doc.indexed, 'doc.indexed');

  if(doc.sequence < 0) {
    throw new TypeError('"doc.sequence" must be a non-negative integer.');
  }

  const {id} = doc;
  const now = Date.now();
  const meta = {created: now, updated: now};
  const record = {
    edvId: database.hash(edvId),
    id: database.hash(id),
    meta,
    doc
  };

  // build top-level unique index field
  const $set = {doc, 'meta.updated': now};
  const uniqueAttributes = _buildUniqueAttributesIndex(doc);
  if(uniqueAttributes.length > 0) {
    $set.uniqueAttributes = uniqueAttributes;
  }

  try {
    const result = await database.collections.edvDoc.updateOne({
      edvId: record.edvId,
      id: record.id,
      'doc.sequence': doc.sequence - 1
    }, {
      $set,
      $setOnInsert: {
        edvId: record.edvId, id: record.id, 'meta.created': now
      }
    }, {...database.writeOptions, upsert: true});

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
 * Removes an EDV document.
 *
 * @param {string} edvId the ID of the EDV the document is in.
 * @param {string} id the ID of the document to remove.
 *
 * @return {Promise<Boolean>} resolves to `true` if a document was removed and
 *   `false` if not.
 */
api.remove = async ({edvId, id}) => {
  assert.string(edvId, 'edvId');
  assert.string(id, 'id');
  _assert128BitId(id);

  const result = await database.collections.edvDoc.deleteOne(
    {edvId: database.hash(edvId), id: database.hash(id)});
  return result.result.n !== 0;
};

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
api.updateChunk = async ({edvId, docId, chunk}) => {
  assert.string(edvId, 'edvId');
  assert.string(docId, 'docId');
  _assert128BitId(docId);
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
  const {doc} = await api.get({edvId, id: docId});
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
api.getChunk = async ({edvId, docId, chunkIndex}) => {
  assert.string(edvId, 'edvId');
  assert.string(docId, 'docId');
  _assert128BitId(docId);
  assert.number(chunkIndex, 'chunkIndex');
  if(!(chunkIndex >= 0 && Number.isInteger(chunkIndex))) {
    throw new TypeError('"chunk.index" must be a non-negative integer.');
  }

  // TODO: store chunks as files instead of documents
  const record = await database.collections.edvDocChunk.findOne({
    edvId: database.hash(edvId), docId: database.hash(docId),
    'chunk.index': chunkIndex
  }, {_id: 0, chunk: 1, meta: 1});
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
api.removeChunk = async ({edvId, docId, chunkIndex}) => {
  assert.string(edvId, 'edvId');
  assert.string(docId, 'docId');
  _assert128BitId(docId);
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

function _assert128BitId(id) {
  try {
    // verify ID is multibase base58-encoded 16 bytes
    const buf = base58.decode(id.substr(1));
    // multibase base58 (starts with 'z')
    // 128-bit random number, multibase encoded
    // 0x00 = identity tag, 0x10 = length (16 bytes) + 16 random bytes
    if(!(id.startsWith('z') &&
      buf.length === 18 && buf[0] === 0x00 && buf[1] === 0x10)) {
      throw new Error('Invalid identifier.');
    }
  } catch(e) {
    throw new Error(`Identifier "${id}" must be multibase, base58-encoded ` +
      'array of 16 random bytes.');
  }
}
