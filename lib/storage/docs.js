/*!
 * Copyright (c) 2018-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as database from '@bedrock/mongodb';
import {
  assert128BitId, parseLocalId, validateDocSequence
} from '../helpers.js';
import assert from 'assert-plus';
import {logger} from '../logger.js';

const {util: {BedrockError}} = bedrock;

const COLLECTION_NAME = 'edv-storage-doc';

export let DOC_COMPATIBILITY_VERSION;

bedrock.events.on('bedrock-mongodb.ready', async () => {
  const cfg = bedrock.config['edv-storage'];
  DOC_COMPATIBILITY_VERSION = cfg.documentCompatibilityVersion;

  await database.openCollections([COLLECTION_NAME]);

  // start fetching version `0` index status
  const collection = database.collections[COLLECTION_NAME];
  const checkIndexPromise = collection.indexExists('attributes').catch(e => e);

  await database.createIndexes([{
    // cover document queries by EDV ID + document ID
    collection: COLLECTION_NAME,
    fields: {localEdvId: 1, 'doc.id': 1},
    options: {unique: true}
  }, {
    // cover document attribute-based "equals" queries
    collection: COLLECTION_NAME,
    fields: {
      localEdvId: 1,
      attributes: 1
    },
    options: {
      name: 'attributes.equals',
      partialFilterExpression: {
        attributes: {$exists: true}
      },
      unique: false
    }
  }, {
    // cover document attribute-based "has" queries
    collection: COLLECTION_NAME,
    fields: {
      localEdvId: 1,
      'doc.indexed.hmac.id': 1,
      'doc.indexed.attributes.name': 1
    },
    options: {
      name: 'attributes.has',
      partialFilterExpression: {
        'doc.indexed.hmac.id': {$exists: true},
        'doc.indexed.attributes.name': {$exists: true}
      },
      unique: false
    }
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
      unique: true
    }
  }, {
    // version index for migration
    collection: COLLECTION_NAME,
    fields: {version: 1},
    options: {unique: false}
  }]);

  await _handleDocumentCompatibility({checkIndexPromise});
});

/**
 * Builds a query to be passed to `find` or `count` using the given EDV
 * `index`, `equals`, and `has` parameters.
 *
 * @param {object} options - The options to use.
 * @param {string} options.index - The EDV index ID.
 * @param {Array} [options.equals] - The EDV `equals` query array.
 * @param {Array} [options.has] - The EDV `has` query array.
 *
 * @returns {object} The query.
 */
export function buildQuery({index, equals, has} = {}) {
  // version `0` query
  if(DOC_COMPATIBILITY_VERSION === 0) {
    let query = {'doc.indexed.hmac.id': index};
    if(equals) {
      const $or = [];
      const allStrings = equals.every(e => {
        const $all = [];
        for(const key in e) {
          if(typeof e[key] !== 'string') {
            return false;
          }
          $all.push({$elemMatch: {name: key, value: e[key]}});
        }
        $or.push({
          ...query,
          'doc.indexed.attributes': {
            $all
          }
        });
        return true;
      });
      query = {$or};
      if(!allStrings) {
        throw new BedrockError(
          'Invalid "equals" query; each array element must be an object ' +
          'with keys that have values that are strings.', {
            name: 'DataError',
            details: {public: true, httpStatusCode: 400}
          });
      }
    } else {
      // `has` query
      query['doc.indexed.attributes.name'] = {$all: has};
    }
    return query;
  }

  // version `1` `has` query
  if(has) {
    return {
      'doc.indexed.hmac.id': index,
      'doc.indexed.attributes.name': {$all: has}
    };
  }

  // version `1` `equals` query
  const hmacIdHash = database.hash(index);
  const $or = [];
  const allStrings = equals.every(e => {
    const attributes = [];
    for(const key in e) {
      if(typeof e[key] !== 'string') {
        return false;
      }
      attributes.push({name: key, value: e[key]});
    }
    $or.push({
      attributes: {
        $all: _buildAttributes({hmacIdHash, attributes})
      }
    });
    return true;
  });
  if(!allStrings) {
    throw new BedrockError(
      'Invalid "equals" query; each array element must be an object ' +
      'with keys that have values that are strings.', {
        name: 'DataError',
        details: {public: true, httpStatusCode: 400}
      });
  }
  return {$or};
}

/**
 * Inserts an EDV document.
 *
 * @param {object} options - The options to use.
 * @param {string} options.edvId - The ID of the EDV to store the document in.
 * @param {object} options.doc - The document to insert.
 *
 * @returns {Promise<object>} Resolves to the database record.
 */
export async function insert({edvId, doc}) {
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

  // build top-level attributes index field
  const attributes = _buildAttributesIndex(doc);
  if(attributes.length > 0) {
    record.attributes = attributes;
  }

  // build top-level unique index field
  const uniqueAttributes = _buildUniqueAttributesIndex(doc);
  if(uniqueAttributes.length > 0) {
    record.uniqueAttributes = uniqueAttributes;
  }

  try {
    const collection = database.collections[COLLECTION_NAME];
    await collection.insertOne(record);
    return record;
  } catch(e) {
    if(!database.isDuplicateError(e)) {
      throw e;
    }
    throw new BedrockError('Duplicate document.', {
      name: 'DuplicateError',
      details: {
        public: true,
        httpStatusCode: 409
      },
      cause: e
    });
  }
}

/**
 * Gets an EDV document.
 *
 * @param {object} options - The options to use.
 * @param {string} options.edvId - The ID of the EDV that the document is in.
 * @param {string} options.id - The ID of the document to retrieve.
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @returns {Promise<object | ExplainObject>} Resolves with the record that
 *   matches the query or an ExplainObject if `explain=true`.
 */
export async function get({edvId, id, explain = false} = {}) {
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
    throw new BedrockError('Document not found.', {
      name: 'NotFoundError',
      details: {edv: edvId, doc: id, httpStatusCode: 404, public: true}
    });
  }

  return record;
}

/**
 * Retrieves all EDV documents matching the given query.
 *
 * @param {object} options - The options to use.
 * @param {string} options.edvId - The ID of the EDV to query.
 * @param {object} options.query - The optional query to use (default: {}).
 * @param {object} [options.options={}] - Query options (eg: 'sort', 'limit').
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @returns {Promise<Array | ExplainObject>} Resolves with the records that
 *   matched the query or returns an ExplainObject if `explain=true`.
 */
export async function find({
  edvId, query = {}, options = {}, explain = false
} = {}) {
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
}

export async function count({
  edvId, query = {}, options = {}, explain = false
} = {}) {
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
}

/**
 * Updates (replaces) an EDV document. If the document does not exist,
 * it will be inserted. See `insert`.
 *
 * @param {object} options - The options to use.
 * @param {string} options.edvId - The ID of the EDV the document is in.
 * @param {object} options.doc - The document to store.
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @returns {Promise<boolean | ExplainObject>} Resolves with `true` on update
 *   success or an ExplainObject if `explain=true`.
 */
export async function update({edvId, doc, explain = false} = {}) {
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

  // build top-level attributes index field
  const attributes = _buildAttributesIndex(doc);
  if(attributes.length > 0) {
    update.$set.attributes = attributes;
  } else {
    update.$unset = {attributes: true};
  }

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
    const result = await collection.updateOne(query, update, {upsert: true});
    if(result.modifiedCount > 0 || result.upsertedCount > 0) {
      // document upserted or modified: success
      return true;
    }
  } catch(e) {
    if(!database.isDuplicateError(e)) {
      throw e;
    }
    throw new BedrockError('Duplicate document.', {
      name: 'DuplicateError',
      details: {
        public: true,
        httpStatusCode: 409
      },
      cause: e
    });
  }

  throw new BedrockError(
    'Could not update document. Sequence does not match.', {
      name: 'InvalidStateError',
      details: {
        httpStatusCode: 409,
        public: true,
        expected: doc.sequence
      }
    });
}

/**
 * Gets the total size, in bytes, for documents in a given EDV.
 *
 * @param {object} options - The options to use.
 * @param {string} options.edvId - The ID of the EDV.
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @returns {Promise<object | ExplainObject>} Resolves with the total size
 *   information for records that matched the query or returns an ExplainObject
 *   if `explain=true`.
 */
export async function getTotalSize({edvId, explain = false} = {}) {
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
}

function _buildAttributesIndex(doc) {
  const attributes = [];

  // build top-level attributes index field
  if(doc.indexed) {
    for(const entry of doc.indexed) {
      if(entry.attributes?.length > 0) {
        const hmacIdHash = database.hash(entry.hmac.id);
        attributes.push(..._buildAttributes({
          hmacIdHash, attributes: entry.attributes
        }));
      }
    }
  }

  return attributes;
}

function _buildAttributes({hmacIdHash, attributes}) {
  const results = [];
  for(const attribute of attributes) {
    // concat hash of hmac ID, name, and value for unique indexing
    results.push(`${hmacIdHash}:${attribute.name}:${attribute.value}`);
  }
  return results;
}

function _buildUniqueAttributesIndex(doc) {
  const uniqueAttributes = [];

  // build top-level unique index field
  if(doc.indexed) {
    for(const entry of doc.indexed) {
      if(entry.attributes) {
        const hmacIdHash = database.hash(entry.hmac.id);
        for(const attribute of entry.attributes) {
          if(attribute.unique) {
            // concat hash of hmac ID, name, and value for unique indexing
            uniqueAttributes.push(
              `${hmacIdHash}:${attribute.name}:${attribute.value}`);
          }
        }
      }
    }
  }

  return uniqueAttributes;
}

// only exported for testing purposes
export async function _handleDocumentCompatibility({
  checkIndexPromise, background = true
} = {}) {
  if(DOC_COMPATIBILITY_VERSION === 1) {
    const indexExists = await checkIndexPromise;
    if(indexExists === false) {
      // no migration to perform
      return;
    }
    if(indexExists instanceof Error) {
      // error checking migration status
      throw indexExists;
    }

    // ensure all docs have migrated before removing obsolete index
    await _startMigrationToVersion1({background: false});

    // compare total docs to version 1 docs
    const collection = database.collections[COLLECTION_NAME];
    const [total, version1Docs] = await Promise.all([
      collection.countDocuments(),
      collection.countDocuments({version: 1})
    ]);
    if(total !== version1Docs) {
      throw new BedrockError(
        'Invalid state error while performing EDV document migration. All ' +
        'documents must be version "1" after migration, but they are not.', {
          name: 'DataError',
          details: {public: true, httpStatusCode: 500}
        });
    }
    // now remove version `0` `attributes` index; this assumes (and is only
    // safe if this assumption holds) that all software accessing the database
    // is running this version or later of this module; if this is not true,
    // then version `0` documents may be concurrently inserted and fail to be
    // properly indexed w/o running migration again -- this can lead to
    // corruption and should never be allowed to happen
    try {
      await collection.dropIndex('attributes');
    } catch(error) {
      if(error.codeName !== 'IndexNotFound') {
        logger.error(
          'Failed to drop EDV doc version 0 index; perhaps already dropped; ' +
          'will check again later.', {error});
      }
    }
    return;
  }

  // DOC_COMPATIBILITY_VERSION === 0
  // add version `0` legacy index
  await database.createIndexes([{
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
      unique: false
    }
  }]);

  // always start migration to version `1`
  await _startMigrationToVersion1({background});
}

async function _startMigrationToVersion1({background = true} = {}) {
  // find version `0` (null) docs
  const collection = database.collections[COLLECTION_NAME];
  const cursor = await collection.find(
    {version: null},
    {projection: {_id: 0, localEdvId: 1, doc: 1}});

  const migrationRequired = await cursor.hasNext();
  if(migrationRequired) {
    const promise = _migrateToVersion1(cursor).then(remaining => {
      if(remaining > 0) {
        // reschedule migration
        return new Promise((resolve, reject) => {
          setTimeout(() => _startMigrationToVersion1({background: false})
            .then(resolve, reject));
        });
      }
    });
    if(background) {
      // let migration run asynchronously
      promise.catch(error => logger.error(
        `Failed to perform EDV doc version 1 migration; will try again later.`,
        {error}));
    } else {
      // wait for migration to complete
      await promise;
    }
  }
  return migrationRequired;
}

async function _migrateToVersion1(cursor) {
  logger.info('Starting migration of all EDV documents to version 1.');

  while(await cursor.hasNext()) {
    // migrate next record
    const record = await cursor.next();
    await _migrateDocToVersion1(record);
  }

  // compare total docs to version 1 docs
  const collection = database.collections[COLLECTION_NAME];
  const [total, version1Docs] = await Promise.all([
    collection.countDocuments(),
    collection.countDocuments({version: 1})
  ]);
  const remaining = total - version1Docs;
  if(remaining === 0) {
    logger.info('Successfully migrated all EDV documents to version 1.');
  } else {
    logger.info(
      `Not all EDV documents migrated to version 1; remaining=${remaining}.`);
  }
  return remaining;
}

async function _migrateDocToVersion1(record) {
  // build update to move record from version `0` to version `1`
  const update = {};
  update.$set = {version: 1};

  // build top-level attributes index field
  const {localEdvId, doc} = record;
  const attributes = _buildAttributesIndex(doc);
  if(attributes.length > 0) {
    update.$set.attributes = attributes;
  } else {
    update.$unset = {attributes: true};
  }

  // perform update only if sequence matches, without changing sequence or
  // changing update time; this is a "transparent" migration
  const collection = database.collections[COLLECTION_NAME];
  const query = {
    localEdvId,
    'doc.id': doc.id,
    'doc.sequence': doc.sequence
  };

  try {
    const result = await collection.updateOne(query, update);
    if(result.modifiedCount > 0) {
      // document upserted or modified: success
      return true;
    }
  } catch(error) {
    // log but ignore error
    logger.error(
      `Failed to migrate EDV doc (${doc.id}) in ` +
      `EDV (${localEdvId.toString('base64')}) to version 1; ` +
      'will try again later.', {error});
  }
}

// export for testing purposes only
export function _setDocumentCompatibilityVersion(version) {
  DOC_COMPATIBILITY_VERSION = version;
}

/**
 * An object containing information on the query plan.
 *
 * @typedef {object} ExplainObject
 */
