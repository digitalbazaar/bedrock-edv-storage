/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const edvs = require('./edvs');
const docs = require('./docs');
const chunks = require('./chunks');

// module API
const api = {
  edvs,
  docs,
  chunks,
  // deprecated APIs:
  // EDVs
  insertConfig: edvs.insert,
  updateConfig: edvs.update,
  findConfig: edvs.find,
  getConfig: edvs.get,
  // docs
  insert: docs.insert,
  get: docs.get,
  find: docs.find,
  count: docs.count,
  update: docs.update,
  // chunks
  updateChunk: chunks.update,
  getChunk: chunks.get,
  removeChunk: chunks.remove
};
module.exports = api;
