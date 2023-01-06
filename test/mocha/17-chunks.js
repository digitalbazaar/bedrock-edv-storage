/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as brEdvStorage from '@bedrock/edv-storage';
import * as helpers from './helpers.js';
import {driver as _didKeyDriver} from '@digitalbazaar/did-method-key';
import {config} from '@bedrock/core';
import {mockData} from './mock.data.js';

let kid;
let keyAgreementKey;

const didKeyDriver = _didKeyDriver();

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
  it('should get the total size', async function() {
    let result;
    let error;
    try {
      result = await brEdvStorage.chunks.getTotalSize({edvId: mockEdvId});
    } catch(e) {
      error = e;
    }
    should.not.exist(error, 'getTotalSize should not error.');
    should.exist(result, 'getTotalSize result should exist.');
    result.should.be.an('object', 'getTotalSize result should be an object');
    result.should.have.property(
      'size', 0, 'getTotalSize result.size should equal 0');
  });
});
