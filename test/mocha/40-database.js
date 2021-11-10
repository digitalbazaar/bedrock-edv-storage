/*
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

describe('Docs Database Tests', () => {
  describe('Indexes', async () => {
    let doc;
    beforeEach(async () => {
      await helpers.prepareDatabase();
      const {methodFor} = await didKeyDriver.generate();
      keyAgreementKey = methodFor({purpose: 'keyAgreement'});
      kid = keyAgreementKey.id;

      const {doc2} = mockData;
      doc = {...doc2};
      doc.jwe.recipients[0].header.kid = kid;
      await brEdvStorage.docs.insert({
        edvId: mockEdvId,
        doc
      });
    });
    it(`is properly indexed for 'localEdvId' and 'doc.id' in get()`,
      async () => {
        const {executionStats} = await brEdvStorage.docs.get({
          edvId: mockEdvId,
          id: doc.id,
          explain: true
        });
        executionStats.nReturned.should.equal(1);
        executionStats.totalKeysExamined.should.equal(1);
        executionStats.totalDocsExamined.should.equal(1);
        executionStats.executionStages.inputStage.inputStage.inputStage.stage
          .should.equal('IXSCAN');
      });
    it(`is properly indexed for 'localEdvId' in find()`,
      async () => {
        const {executionStats} = await brEdvStorage.docs.find({
          edvId: mockEdvId,
          query: {},
          explain: true
        });
        executionStats.nReturned.should.equal(1);
        executionStats.totalKeysExamined.should.equal(1);
        executionStats.totalDocsExamined.should.equal(1);
        executionStats.executionStages.inputStage.stage
          .should.equal('IXSCAN');
      });
    it(`is properly indexed for 'localEdvId' and 'doc.id' in find()`,
      async () => {
        const {executionStats} = await brEdvStorage.docs.find({
          edvId: mockEdvId,
          query: {'doc.id': doc.id},
          explain: true
        });
        executionStats.nReturned.should.equal(1);
        executionStats.totalKeysExamined.should.equal(1);
        executionStats.totalDocsExamined.should.equal(1);
        executionStats.executionStages.inputStage.stage
          .should.equal('IXSCAN');
      });
    it(`is properly indexed for 'localEdvId' in count()`,
      async () => {
        const {executionStats} = await brEdvStorage.docs.count({
          edvId: mockEdvId,
          query: {},
          explain: true
        });
        executionStats.nReturned.should.equal(1);
        executionStats.totalKeysExamined.should.equal(1);
        executionStats.totalDocsExamined.should.equal(1);
        executionStats.executionStages.inputStage.stage
          .should.equal('IXSCAN');
      });
    it(`is properly indexed for 'localEdvId' and 'doc.id' in count()`,
      async () => {
        const {executionStats} = await brEdvStorage.docs.count({
          edvId: mockEdvId,
          query: {'doc.id': doc.id},
          explain: true
        });
        executionStats.nReturned.should.equal(1);
        executionStats.totalKeysExamined.should.equal(1);
        executionStats.totalDocsExamined.should.equal(1);
        executionStats.executionStages.inputStage.stage
          .should.equal('IXSCAN');
      });
    it(`is properly indexed for 'localEdvId', 'doc.id' and 'doc.sequence' in ` +
      'update()', async () => {
      doc.sequence += 1;
      const {executionStats} = await brEdvStorage.docs.update({
        edvId: mockEdvId,
        doc,
        explain: true
      });
      executionStats.nReturned.should.equal(1);
      executionStats.totalKeysExamined.should.equal(1);
      executionStats.totalDocsExamined.should.equal(1);
      executionStats.executionStages.inputStage.inputStage.stage
        .should.equal('IXSCAN');
    });
  });
});

describe('EDV Database Tests', () => {
  describe('Indexes', async () => {
    let edvConfig;
    beforeEach(async () => {
      await helpers.prepareDatabase();
      edvConfig = {...mockData.config};
      edvConfig.id = mockEdvId;
      await brEdvStorage.edvs.insert({config: edvConfig});
    });
    it(`is properly indexed for 'config.controller' in find()`, async () => {
      const {executionStats} = await brEdvStorage.edvs.find({
        controller: edvConfig.controller,
        query: {},
        explain: true
      });
      executionStats.nReturned.should.equal(1);
      executionStats.totalKeysExamined.should.equal(1);
      executionStats.totalDocsExamined.should.equal(1);
      executionStats.executionStages.inputStage.stage
        .should.equal('IXSCAN');
    });
    it(`is properly indexed for 'config.id' and 'config.controller' in find()`,
      async () => {
        const {executionStats} = await brEdvStorage.edvs.find({
          controller: edvConfig.controller,
          query: {'config.id': mockEdvId},
          explain: true
        });
        executionStats.nReturned.should.equal(1);
        executionStats.totalKeysExamined.should.equal(1);
        executionStats.totalDocsExamined.should.equal(1);
        executionStats.executionStages.inputStage.stage
          .should.equal('IXSCAN');
      });
    it(`is properly indexed for 'config.id' and 'config.sequence' in ` +
      'update()', async () => {
      edvConfig.sequence += 1;
      const {executionStats} = await brEdvStorage.edvs.update({
        config: edvConfig,
        explain: true
      });
      executionStats.nReturned.should.equal(1);
      executionStats.totalKeysExamined.should.equal(1);
      executionStats.totalDocsExamined.should.equal(1);
      executionStats.executionStages.inputStage.inputStage.stage
        .should.equal('IXSCAN');
    });
    it(`is properly indexed for 'config.id' in get()`, async () => {
      const {executionStats} = await brEdvStorage.edvs.get({
        id: edvConfig.id,
        explain: true
      });
      executionStats.nReturned.should.equal(1);
      executionStats.totalKeysExamined.should.equal(1);
      executionStats.totalDocsExamined.should.equal(1);
      executionStats.executionStages.inputStage.inputStage.inputStage.stage
        .should.equal('IXSCAN');
    });
  });
});

describe('Chunks Database Tests', () => {
  describe('Indexes', async () => {
    let doc;
    let chunk;
    beforeEach(async () => {
      await helpers.prepareDatabase();
      const {methodFor} = await didKeyDriver.generate();
      keyAgreementKey = methodFor({purpose: 'keyAgreement'});
      kid = keyAgreementKey.id;

      const {doc2} = mockData;
      doc = {...doc2};
      doc.jwe.recipients[0].header.kid = kid;
      const docInsertResult = await brEdvStorage.docs.insert({
        edvId: mockEdvId,
        doc
      });
      const {doc: {jwe}} = docInsertResult;

      const data = helpers.getRandomUint8();
      const reader = await helpers.createEncryptStream(
        {recipients: jwe.recipients, chunkSize, data});
      const {value} = await reader.read();

      // inserts chunk into database
      chunk = {
        sequence: doc.sequence,
        ...value,
      };
      await brEdvStorage.chunks.update(
        {edvId: mockEdvId, docId: doc.id, chunk});
    });
    it(`is properly indexed for 'localEdvId', 'docId' and 'chunk.index' in ` +
      'update()', async () => {
      const {executionStats} = await brEdvStorage.chunks.update({
        edvId: mockEdvId,
        docId: doc.id,
        chunk,
        explain: true
      });
      executionStats.nReturned.should.equal(1);
      executionStats.totalKeysExamined.should.equal(1);
      executionStats.totalDocsExamined.should.equal(1);
      executionStats.executionStages.inputStage.inputStage.stage
        .should.equal('IXSCAN');
    });
    it(`is properly indexed for 'localEdvId', 'docId' and 'chunk.index' in ` +
      'get()', async () => {
      const {executionStats} = await brEdvStorage.chunks.get({
        edvId: mockEdvId,
        docId: doc.id,
        chunkIndex: 0,
        explain: true
      });
      executionStats.nReturned.should.equal(1);
      executionStats.totalKeysExamined.should.equal(1);
      executionStats.totalDocsExamined.should.equal(1);
      executionStats.executionStages.inputStage.inputStage.inputStage.stage
        .should.equal('IXSCAN');
    });
    it(`is properly indexed for 'localEdvId', 'docId' and 'chunk.index' in ` +
      'remove()', async () => {
      const {executionStats} = await brEdvStorage.chunks.remove({
        edvId: mockEdvId,
        docId: doc.id,
        chunkIndex: 0,
        explain: true
      });
      executionStats.nReturned.should.equal(1);
      executionStats.totalKeysExamined.should.equal(1);
      executionStats.totalDocsExamined.should.equal(1);
      executionStats.executionStages.inputStage.inputStage.stage
        .should.equal('IXSCAN');
    });
  });
});
