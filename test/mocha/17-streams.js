/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');
const brEdvStorage = require('bedrock-edv-storage');
const database = require('bedrock-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');
const {Cipher} = require('minimal-cipher');
const {ReadableStream} = require('web-streams-polyfill/ponyfill');

let actors;
let accounts;

const chunkSize = 1048576;
const cipher = new Cipher();
const {keyResolver} = helpers;

const mockEdvId = `${config.server.baseUri}/edvs/z19xXoFRcobgskDQ6ywrRaa17`;
const hashedMockEdvId = database.hash(mockEdvId);
// stream tests require a real KaK
const kid = 'did:key:z6MkoLSj28uRLaYUWFevCtCqgYdZLpP6d4kN2tRo1URZPdrm#z6LS' +
  'g1RLCrRGZ7sPKn9Aa41JEzBGe3S42qGURnKPcL4695uf';

describe('chunk API', () => {
  before(async () => {
    await helpers.prepareDatabase(mockData);
    actors = await helpers.getActors(mockData);
    accounts = mockData.accounts;
  });
  before(async () => {
    const actor = actors['alpha@example.com'];
    const account = accounts['alpha@example.com'].account;
    const edvConfig = {...mockData.config, controller: account.id};
    edvConfig.id = mockEdvId;
    await brEdvStorage.insertConfig({actor, config: edvConfig});
  });

  beforeEach(async () => {
    await helpers.prepareDatabase(mockData);
  });

  it('should insert a new chunk', async () => {
    const {doc1} = mockData;
    const doc = {...doc1};
    doc.jwe.recipients[0].header.kid = kid;
    const hashedDocId = database.hash(doc.id);
    const docInsertResult = await brEdvStorage.insert({
      edvId: mockEdvId,
      doc,
    });
    should.exist(docInsertResult);
    docInsertResult.edvId.should.equal(hashedMockEdvId);
    docInsertResult.id.should.equal(hashedDocId);
    docInsertResult.doc.should.eql(doc);
    const {doc: {jwe}} = docInsertResult;

    const data = helpers.getRandomUint8();
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(data);
        controller.close();
      }
    });
    const encryptStream = await cipher.createEncryptStream(
      {recipients: jwe.recipients, keyResolver, chunkSize});
    // pipe user supplied `stream` through the encrypt stream
    //const readable = forStorage.pipeThrough(encryptStream);
    const readable = stream.pipeThrough(encryptStream);
    const reader = readable.getReader();

    // continually read from encrypt stream and upload result
    let value;
    let done;
    let chunks = 0;
    let error;
    let result;
    while(!done) {
      // read next encrypted chunk
      ({value, done} = await reader.read());
      if(!value) {
        break;
      }

      // create chunk
      chunks++;
      const chunk = {
        sequence: doc.sequence,
        ...value,
      };
      try {
        result = await brEdvStorage.updateChunk(
          {edvId: mockEdvId, docId: doc.id, chunk});
      } catch(e) {
        error = e;
        done = true;
      }
    }
    chunks.should.eql(1);
    should.not.exist(error);
    should.exist(result);
    result.should.be.a('boolean');
    result.should.eql(true);
  });
  it('should insert multiple chunks', async () => {
    const {doc1} = mockData;
    const doc = {...doc1};
    doc.jwe.recipients[0].header.kid = kid;
    const hashedDocId = database.hash(doc.id);
    const docInsertResult = await brEdvStorage.insert({
      edvId: mockEdvId,
      doc,
    });
    should.exist(docInsertResult);
    docInsertResult.edvId.should.equal(hashedMockEdvId);
    docInsertResult.id.should.equal(hashedDocId);
    docInsertResult.doc.should.eql(doc);
    const {doc: {jwe}} = docInsertResult;

    const data = helpers.getRandomUint8();
    const stream = new ReadableStream({
      pull(controller) {
        for(let i = 0; i < data.length; i += 5) {
          const chunk = data.slice(i, i + 5);
          console.log({i, data, chunk});
          controller.enqueue(chunk);
        }
        controller.close();
      }
    });
    const encryptStream = await cipher.createEncryptStream(
      {recipients: jwe.recipients, keyResolver, chunkSize: 5});
    // pipe user supplied `stream` through the encrypt stream
    //const readable = forStorage.pipeThrough(encryptStream);
    const readable = stream.pipeThrough(encryptStream);
    const reader = readable.getReader();

    // continually read from encrypt stream and upload result
    let value;
    let done;
    let chunks = 0;
    let error;
    let result;
    while(!done) {
      // read next encrypted chunk
      ({value, done} = await reader.read());
      if(!value) {
        break;
      }

      // create chunk
      chunks++;
      const chunk = {
        sequence: doc.sequence,
        ...value,
      };
      try {
        result = await brEdvStorage.updateChunk(
          {edvId: mockEdvId, docId: doc.id, chunk});
      } catch(e) {
        error = e;
        done = true;
      }
    }
    chunks.should.eql(10);
    should.not.exist(error);
    should.exist(result);
    result.should.be.a('boolean');
    result.should.eql(true);
    // FIXME decrypt and check chunks here
  });

  it('should get a chunk', async () => {
    const {doc1} = mockData;
    const doc = {...doc1};
    doc.jwe.recipients[0].header.kid = kid;
    const hashedDocId = database.hash(doc.id);
    const docInsertResult = await brEdvStorage.insert({
      edvId: mockEdvId,
      doc,
    });
    should.exist(docInsertResult);
    docInsertResult.edvId.should.equal(hashedMockEdvId);
    docInsertResult.id.should.equal(hashedDocId);
    docInsertResult.doc.should.eql(doc);
    const {doc: {jwe}} = docInsertResult;

    const data = helpers.getRandomUint8();
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(data);
        controller.close();
      }
    });
    const encryptStream = await cipher.createEncryptStream(
      {recipients: jwe.recipients, keyResolver, chunkSize});
    // pipe user supplied `stream` through the encrypt stream
    //const readable = forStorage.pipeThrough(encryptStream);
    const readable = stream.pipeThrough(encryptStream);
    const reader = readable.getReader();

    // continually read from encrypt stream and upload result
    let value;
    let done;
    let chunks = 0;
    let result;
    let error;
    while(!done) {
      // read next encrypted chunk
      ({value, done} = await reader.read());
      if(!value) {
        break;
      }

      // create chunk
      chunks++;
      const chunk = {
        sequence: doc.sequence,
        ...value,
      };
      try {
        result = await brEdvStorage.updateChunk(
          {edvId: mockEdvId, docId: doc.id, chunk});
      } catch(e) {
        error = e;
        done = true;
      }
    }
    chunks.should.eql(1);
    should.not.exist(error);
    should.exist(result);
    result.should.be.a('boolean');
    result.should.eql(true);
    const {chunk} = await brEdvStorage.getChunk(
      {edvId: mockEdvId, docId: doc.id, chunkIndex: 0});
    should.exist(chunk);
    chunk.should.be.an('object');
    chunk.should.have.all.keys(['sequence', 'index', 'offset', 'jwe']);
    chunk.sequence.should.be.a('number');
    chunk.sequence.should.eql(0);
    chunk.index.should.be.a('number');
    chunk.index.should.eql(0);
    chunk.offset.should.be.a('number');
    chunk.offset.should.eql(50);
    chunk.jwe.should.be.an('object');
  });
  it('should remove a chunk', async () => {
    const {doc1} = mockData;
    const doc = {...doc1};
    doc.jwe.recipients[0].header.kid = kid;
    const hashedDocId = database.hash(doc.id);
    const docInsertResult = await brEdvStorage.insert({
      edvId: mockEdvId,
      doc,
    });
    should.exist(docInsertResult);
    docInsertResult.edvId.should.equal(hashedMockEdvId);
    docInsertResult.id.should.equal(hashedDocId);
    docInsertResult.doc.should.eql(doc);
    const {doc: {jwe}} = docInsertResult;

    const data = helpers.getRandomUint8();
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(data);
        controller.close();
      }
    });
    const encryptStream = await cipher.createEncryptStream(
      {recipients: jwe.recipients, keyResolver, chunkSize});
    // pipe user supplied `stream` through the encrypt stream
    //const readable = forStorage.pipeThrough(encryptStream);
    const readable = stream.pipeThrough(encryptStream);
    const reader = readable.getReader();

    // continually read from encrypt stream and upload result
    let value;
    let done;
    let chunks = 0;
    let result;
    let error;
    while(!done) {
      // read next encrypted chunk
      ({value, done} = await reader.read());
      if(!value) {
        break;
      }

      // create chunk
      chunks++;
      const chunk = {
        sequence: doc.sequence,
        ...value,
      };
      try {
        result = await brEdvStorage.updateChunk(
          {edvId: mockEdvId, docId: doc.id, chunk});
      } catch(e) {
        error = e;
        done = true;
      }
    }
    chunks.should.eql(1);
    should.not.exist(error);
    should.exist(result);
    result.should.be.a('boolean');
    result.should.eql(true);
    result = undefined;
    try {
      result = await brEdvStorage.removeChunk(
        {edvId: mockEdvId, docId: doc.id, chunkIndex: 0});
    } catch(e) {
      error = e;
    }
    should.not.exist(error);
    should.exist(result);
    result.should.be.a('boolean');
    result.should.eql(true);
    result = undefined;
    try {
      result = await brEdvStorage.getChunk(
        {edvId: mockEdvId, docId: doc.id, chunkIndex: 0});
    } catch(e) {
      error = e;
    }
    should.exist(error);
    error.should.have.property('name');
    error.name.should.eql('NotFoundError');
    should.not.exist(result);
  });
});

