/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const chunks = require('./storage/chunks.js');
const docs = require('./storage/docs.js');
const edvs = require('./storage/edvs.js');

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
