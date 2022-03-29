/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as chunks from './storage/chunks.js';
import * as docs from './storage/docs.js';
import * as edvs from './storage/edvs.js';

export {
  edvs,
  docs,
  chunks
};

// deprecated EDV config API
export const insertConfig = edvs.insert;
export const updateConfig = edvs.update;
export const findConfig = edvs.find;
export const getConfig = edvs.get;

// deprecated docs API
export const insert = docs.insert;
export const get = docs.get;
export const find = docs.find;
export const count = docs.count;
export const update = docs.update;

// deprecated chunks API
export const updateChunk = chunks.update;
export const getChunk = chunks.get;
export const removeChunk = chunks.remove;
