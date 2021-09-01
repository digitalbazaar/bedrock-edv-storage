/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');
const brEdvStorage = require('bedrock-edv-storage');
const helpers = require('./helpers');
const mockData = require('./mock.data');

const didKeyDriver = require('@digitalbazaar/did-method-key').driver();

let kid;
let keyAgreementKey;

const chunkSize = 1048576;

const mockEdvId = `${config.server.baseUri}/edvs/z19xXoFRcobgskDQ6ywrRaa17`;
const {localId: localMockEdvId} = helpers.parseLocalId({id: mockEdvId});

describe('chunks API', () => {
  before(async () => {
    await helpers.prepareDatabase();
    const {methodFor} = await didKeyDriver.generate();
    keyAgreementKey = methodFor({purpose: 'keyAgreement'});
    kid = keyAgreementKey.id;
  });
  before(async () => {
    const edvConfig = {...mockData.config};
    edvConfig.id = mockEdvId;
    await brEdvStorage.edvs.insert({config: edvConfig});
  });

  beforeEach(async () => {
    await helpers.prepareDatabase();
  });

  it('should insert a new chunk', async () => {
    const {doc1} = mockData;
    const doc = {...doc1};
    doc.jwe.recipients[0].header.kid = kid;
    const docInsertResult = await brEdvStorage.docs.insert({
      edvId: mockEdvId,
      doc,
    });
    should.exist(docInsertResult);
    docInsertResult.localEdvId.should.deep.equal(localMockEdvId);
    docInsertResult.doc.should.eql(doc);
    const {doc: {jwe}} = docInsertResult;

    const data = helpers.getRandomUint8();
    const reader = await helpers.createEncryptStream(
      {recipients: jwe.recipients, chunkSize, data});
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
        result = await brEdvStorage.chunks.update(
          {edvId: mockEdvId, docId: doc.id, chunk});
      } catch(e) {
        error = e;
        done = true;
      }
    }
    chunks.should.equal(1);
    should.not.exist(error);
    should.exist(result);
    result.should.be.a('boolean');
    result.should.equal(true);
  });
  it('should insert multiple chunks', async () => {
    const {doc1} = mockData;
    const doc = {...doc1};
    doc.jwe.recipients[0].header.kid = kid;
    const docInsertResult = await brEdvStorage.docs.insert({
      edvId: mockEdvId,
      doc,
    });
    should.exist(docInsertResult);
    docInsertResult.localEdvId.should.deep.equal(localMockEdvId);
    docInsertResult.doc.should.eql(doc);
    const {doc: {jwe}} = docInsertResult;

    const data = helpers.getRandomUint8();
    const reader = await helpers.createEncryptStream(
      {recipients: jwe.recipients, chunkSize: 5, data});

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
        result = await brEdvStorage.chunks.update(
          {edvId: mockEdvId, docId: doc.id, chunk});
      } catch(e) {
        error = e;
        done = true;
      }
    }
    chunks.should.equal(10);
    should.not.exist(error);
    should.exist(result);
    result.should.be.a('boolean');
    result.should.equal(true);
    // FIXME decrypt and check chunks here
  });

  it('should get a chunk', async () => {
    const {doc1} = mockData;
    const doc = {...doc1};
    doc.jwe.recipients[0].header.kid = kid;
    const docInsertResult = await brEdvStorage.docs.insert({
      edvId: mockEdvId,
      doc,
    });
    should.exist(docInsertResult);
    docInsertResult.localEdvId.should.deep.equal(localMockEdvId);
    docInsertResult.doc.should.eql(doc);
    const {doc: {jwe}} = docInsertResult;

    const data = helpers.getRandomUint8();
    const reader = await helpers.createEncryptStream(
      {recipients: jwe.recipients, chunkSize, data});

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
        result = await brEdvStorage.chunks.update(
          {edvId: mockEdvId, docId: doc.id, chunk});
      } catch(e) {
        error = e;
        done = true;
      }
    }
    chunks.should.equal(1);
    should.not.exist(error);
    should.exist(result);
    result.should.be.a('boolean');
    result.should.equal(true);
    const {chunk} = await brEdvStorage.chunks.get(
      {edvId: mockEdvId, docId: doc.id, chunkIndex: 0});
    should.exist(chunk);
    chunk.should.be.an('object');
    chunk.should.have.all.keys(['sequence', 'index', 'offset', 'jwe']);
    chunk.sequence.should.be.a('number');
    chunk.sequence.should.equal(0);
    chunk.index.should.be.a('number');
    chunk.index.should.equal(0);
    chunk.offset.should.be.a('number');
    chunk.offset.should.equal(50);
    chunk.jwe.should.be.an('object');
    const decryptResult = await helpers.decryptStream(
      {chunks: [chunk], keyAgreementKey});
    should.exist(decryptResult);
    decryptResult.should.be.an('Uint8Array');
    decryptResult.should.eql(data);
  });
  it('should remove a chunk', async () => {
    const {doc1} = mockData;
    const doc = {...doc1};
    doc.jwe.recipients[0].header.kid = kid;
    const docInsertResult = await brEdvStorage.docs.insert({
      edvId: mockEdvId,
      doc,
    });
    should.exist(docInsertResult);
    docInsertResult.localEdvId.should.deep.equal(localMockEdvId);
    docInsertResult.doc.should.eql(doc);
    const {doc: {jwe}} = docInsertResult;

    const data = helpers.getRandomUint8();
    const reader = await helpers.createEncryptStream(
      {recipients: jwe.recipients, chunkSize, data});

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
        result = await brEdvStorage.chunks.update(
          {edvId: mockEdvId, docId: doc.id, chunk});
      } catch(e) {
        error = e;
        done = true;
      }
    }
    chunks.should.equal(1);
    should.not.exist(error);
    should.exist(result);
    result.should.be.a('boolean');
    result.should.equal(true);
    result = undefined;
    try {
      result = await brEdvStorage.chunks.remove(
        {edvId: mockEdvId, docId: doc.id, chunkIndex: 0});
    } catch(e) {
      error = e;
    }
    should.not.exist(error);
    should.exist(result);
    result.should.be.a('boolean');
    result.should.equal(true);
    result = undefined;
    try {
      result = await brEdvStorage.chunks.get(
        {edvId: mockEdvId, docId: doc.id, chunkIndex: 0});
    } catch(e) {
      error = e;
    }
    should.exist(error);
    error.should.have.property('name');
    error.name.should.equal('NotFoundError');
    should.not.exist(result);
  });
});
