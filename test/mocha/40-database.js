/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as brEdvStorage from '@bedrock/edv-storage';
import * as helpers from './helpers.js';
import {config} from '@bedrock/core';
import {createRequire} from 'node:module';
import {mockData} from './mock.data.js';
const require = createRequire(import.meta.url);
const didKeyDriver = require('@digitalbazaar/did-method-key').driver();

let kid;
let keyAgreementKey;

const chunkSize = 1048576;

const mockEdvId = `${config.server.baseUri}/edvs/z19xXoFRcobgskDQ6ywrRaa17`;
const mockEdvId2 = `${config.server.baseUri}/edvs/z65xToFRcongwkFG2ypqJee95`;

describe('Docs Database Tests', () => {
  describe('Indexes', async () => {
    let mockDoc2;
    beforeEach(async () => {
      await helpers.prepareDatabase();
      const {methodFor} = await didKeyDriver.generate();
      keyAgreementKey = methodFor({purpose: 'keyAgreement'});
      kid = keyAgreementKey.id;

      const {doc2} = mockData;
      mockDoc2 = {...doc2};
      mockDoc2.jwe.recipients[0].header.kid = kid;
      await brEdvStorage.docs.insert({
        edvId: mockEdvId,
        doc: mockDoc2
      });

      const {docWithAttributes} = mockData;
      const mockDoc3 = {...docWithAttributes};
      mockDoc3.jwe.recipients[0].header.kid = kid;
      await brEdvStorage.docs.insert({
        edvId: mockEdvId2,
        doc: mockDoc3
      });
    });
    it(`is properly indexed for 'localEdvId' and 'doc.id' in get()`,
      async () => {
        const {executionStats} = await brEdvStorage.docs.get({
          edvId: mockEdvId,
          id: mockDoc2.id,
          explain: true
        });
        executionStats.nReturned.should.equal(1);
        executionStats.totalKeysExamined.should.equal(1);
        executionStats.totalDocsExamined.should.equal(1);
        executionStats.executionStages.inputStage.inputStage.inputStage.stage
          .should.equal('IXSCAN');
        executionStats.executionStages.inputStage.inputStage.inputStage
          .keyPattern.should.eql({localEdvId: 1, 'doc.id': 1});
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
        executionStats.executionStages.inputStage.stage.should.equal('IXSCAN');
        executionStats.executionStages.inputStage.keyPattern
          .should.eql({localEdvId: 1, 'doc.id': 1});
      });
    it(`is properly indexed for 'localEdvId' and 'doc.id' in find()`,
      async () => {
        const {executionStats} = await brEdvStorage.docs.find({
          edvId: mockEdvId,
          query: {'doc.id': mockDoc2.id},
          explain: true
        });
        executionStats.nReturned.should.equal(1);
        executionStats.totalKeysExamined.should.equal(1);
        executionStats.totalDocsExamined.should.equal(1);
        executionStats.executionStages.inputStage.stage.should.equal('IXSCAN');
        executionStats.executionStages.inputStage.keyPattern
          .should.eql({localEdvId: 1, 'doc.id': 1});
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
        executionStats.executionStages.inputStage.stage.should.equal('IXSCAN');
        executionStats.executionStages.inputStage.keyPattern
          .should.eql({localEdvId: 1, 'doc.id': 1});
      });
    it(`is properly indexed for 'localEdvId' and 'doc.id' in count()`,
      async () => {
        const {executionStats} = await brEdvStorage.docs.count({
          edvId: mockEdvId,
          query: {'doc.id': mockDoc2.id},
          explain: true
        });
        executionStats.nReturned.should.equal(1);
        executionStats.totalKeysExamined.should.equal(1);
        executionStats.totalDocsExamined.should.equal(1);
        executionStats.executionStages.inputStage.stage.should.equal('IXSCAN');
        executionStats.executionStages.inputStage.keyPattern
          .should.eql({localEdvId: 1, 'doc.id': 1});
      });
    it(`is properly indexed for 'localEdvId', 'doc.id' and 'doc.sequence' in ` +
      'update()', async () => {
      mockDoc2.sequence += 1;
      const {executionStats} = await brEdvStorage.docs.update({
        edvId: mockEdvId,
        doc: mockDoc2,
        explain: true
      });
      executionStats.nReturned.should.equal(1);
      executionStats.totalKeysExamined.should.equal(1);
      executionStats.totalDocsExamined.should.equal(1);
      executionStats.executionStages.inputStage.inputStage.stage
        .should.equal('IXSCAN');
      executionStats.executionStages.inputStage.inputStage.keyPattern
        .should.eql({localEdvId: 1, 'doc.id': 1});
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

      const edvConfig2 = {...mockData.config};
      edvConfig2.id = 'e714e635-5e02-4945-b0b9-2132445eb0cb';

      await brEdvStorage.edvs.insert({config: edvConfig});
      await brEdvStorage.edvs.insert({config: edvConfig2});
    });
    it(`is properly indexed for 'config.controller' in find()`, async () => {
      // finds all records that match the 'config.controller' query since it is
      // a non unique index.
      const {executionStats} = await brEdvStorage.edvs.find({
        controller: edvConfig.controller,
        query: {},
        explain: true
      });
      executionStats.nReturned.should.equal(2);
      executionStats.totalKeysExamined.should.equal(2);
      executionStats.totalDocsExamined.should.equal(2);
      executionStats.executionStages.inputStage.stage.should.equal('IXSCAN');
      executionStats.executionStages.inputStage.keyPattern
        .should.eql({'config.controller': 1});
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
        executionStats.executionStages.inputStage.stage.should.equal('IXSCAN');
        executionStats.executionStages.inputStage.keyPattern
          .should.eql({'config.id': 1});
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
      executionStats.executionStages.inputStage.inputStage
        .keyPattern.should.eql({'config.id': 1});
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
      executionStats.executionStages.inputStage.inputStage.inputStage
        .keyPattern.should.eql({'config.id': 1});
    });
  });
});

describe('Chunks Database Tests', () => {
  describe('Indexes', async () => {
    let mockDoc2;
    let chunk;
    beforeEach(async () => {
      await helpers.prepareDatabase();
      const {methodFor} = await didKeyDriver.generate();
      keyAgreementKey = methodFor({purpose: 'keyAgreement'});
      kid = keyAgreementKey.id;

      const {doc2} = mockData;
      mockDoc2 = {...doc2};
      mockDoc2.jwe.recipients[0].header.kid = kid;
      const docInsertResult = await brEdvStorage.docs.insert({
        edvId: mockEdvId,
        doc: mockDoc2
      });
      const {doc: {jwe}} = docInsertResult;

      const {docWithAttributes} = mockData;
      const mockDoc3 = {...docWithAttributes};
      mockDoc3.jwe.recipients[0].header.kid = kid;
      await brEdvStorage.docs.insert({
        edvId: mockEdvId2,
        doc: mockDoc3
      });

      const data = helpers.getRandomUint8();
      const reader = await helpers.createEncryptStream(
        {recipients: jwe.recipients, chunkSize, data});
      const {value} = await reader.read();

      // inserts chunks into database
      chunk = {
        sequence: mockDoc2.sequence,
        ...value,
      };
      const chunk2 = {
        sequence: mockDoc3.sequence,
        ...value,
      };
      await brEdvStorage.chunks.update(
        {edvId: mockEdvId, docId: mockDoc2.id, chunk});
      await brEdvStorage.chunks.update(
        {edvId: mockEdvId2, docId: mockDoc3.id, chunk: chunk2});
    });
    it(`is properly indexed for 'localEdvId', 'docId' and 'chunk.index' in ` +
      'update()', async () => {
      const {executionStats} = await brEdvStorage.chunks.update({
        edvId: mockEdvId,
        docId: mockDoc2.id,
        chunk,
        explain: true
      });
      executionStats.nReturned.should.equal(1);
      executionStats.totalKeysExamined.should.equal(1);
      executionStats.totalDocsExamined.should.equal(1);
      executionStats.executionStages.inputStage.inputStage.stage
        .should.equal('IXSCAN');
      executionStats.executionStages.inputStage.inputStage.keyPattern
        .should.eql({localEdvId: 1, docId: 1, 'chunk.index': 1});
    });
    it(`is properly indexed for 'localEdvId', 'docId' and 'chunk.index' in ` +
      'get()', async () => {
      const {executionStats} = await brEdvStorage.chunks.get({
        edvId: mockEdvId,
        docId: mockDoc2.id,
        chunkIndex: 0,
        explain: true
      });
      executionStats.nReturned.should.equal(1);
      executionStats.totalKeysExamined.should.equal(1);
      executionStats.totalDocsExamined.should.equal(1);
      executionStats.executionStages.inputStage.inputStage.inputStage.stage
        .should.equal('IXSCAN');
      executionStats.executionStages.inputStage.inputStage.inputStage.keyPattern
        .should.eql({localEdvId: 1, docId: 1, 'chunk.index': 1});
    });
    it(`is properly indexed for 'localEdvId', 'docId' and 'chunk.index' in ` +
      'remove()', async () => {
      const {executionStats} = await brEdvStorage.chunks.remove({
        edvId: mockEdvId,
        docId: mockDoc2.id,
        chunkIndex: 0,
        explain: true
      });
      executionStats.nReturned.should.equal(1);
      executionStats.totalKeysExamined.should.equal(1);
      executionStats.totalDocsExamined.should.equal(1);
      executionStats.executionStages.inputStage.inputStage.stage
        .should.equal('IXSCAN');
      executionStats.executionStages.inputStage.inputStage.keyPattern
        .should.eql({localEdvId: 1, docId: 1, 'chunk.index': 1});
    });
  });
});
