/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

require('bedrock-edv-storage');
const bedrock = require('bedrock');
const brHttpsAgent = require('bedrock-https-agent');
const {util: {clone}} = bedrock;
const {config} = bedrock;
const helpers = require('./helpers');
const assertions = require('./assertions');
const mockData = require('./mock.data');
const {EdvClient} = require('edv-client');
const {CapabilityAgent} = require('webkms-client');
let actors;
let urls;

describe('bedrock-edv-storage HTTP API - edv-client', () => {
  let passportStub;

  before(async () => {
    await helpers.prepareDatabase(mockData);
    actors = await helpers.getActors(mockData);
    // common URLs
    const {baseUri} = config.server;
    const root = `${baseUri}/edvs`;
    const invalid = `${baseUri}/edvs/invalid`;
    urls = {
      edvs: root,
      invalidDocuments: `${invalid}/documents`,
      invalidQuery: `${invalid}/query`
    };
  });

  before(() => {
    passportStub = helpers.stubPassport({actor: actors['alpha@example.com']});
  });

  after(() => {
    passportStub.restore();
  });

  describe('insertConfig API', () => {
    it('should create an EDV', async () => {
      const secret = ' b07e6b31-d910-438e-9a5f-08d945a5f676';
      const handle = 'testKey1';

      const capabilityAgent = await CapabilityAgent.fromSecret(
        {secret, handle});

      const keystoreAgent = await helpers.createKeystore({capabilityAgent});

      // corresponds to the passport authenticated user
      const actor = actors['alpha@example.com'];

      let edvClient;
      let edvConfig;
      let err;
      try {
        ({edvClient, edvConfig} = await helpers.createEdv(
          {actor, capabilityAgent, keystoreAgent, urls}));
      } catch(e) {
        err = e;
      }
      assertNoError(err);
      should.exist(edvClient);
      assertions.shouldBeEdvConfig({config: edvConfig});

      urls.documents = `${edvConfig.id}/documents`;
      urls.query = `${edvConfig.id}/query`;
    });
    it('should fail for another account', async () => {
      // controller must match the authenticated user which is alpha@example.com
      let err;
      let edv;
      try {
        const mockConfig =
          {...mockData.config, controller: 'urn:other:account'};
        const {httpsAgent} = brHttpsAgent;
        edv = await EdvClient.createEdv({
          url: urls.edvs,
          config: mockConfig,
          httpsAgent
        });
      } catch(e) {
        err = e;
      }
      should.not.exist(edv);
      should.exist(err);
      should.exist(err.response);
      err.status.should.equal(403);
      err.data.type.should.equal('PermissionDenied');
    });
  }); // end `insertConfig`

  describe('insert API', () => {
    let capabilityAgent;
    let edvClient;

    before(async () => {
      const secret = '40762a17-1696-428f-a2b2-ddf9fe9b4987';
      const handle = 'testKey2';
      capabilityAgent = await CapabilityAgent.fromSecret(
        {secret, handle});

      const keystoreAgent = await helpers.createKeystore({capabilityAgent});

      // corresponds to the passport authenticated user
      const actor = actors['alpha@example.com'];

      ({edvClient} = await helpers.createEdv(
        {actor, capabilityAgent, keystoreAgent, urls}));
    });
    it('should insert a document', async () => {
      let result;
      let err;
      try {
        result = await edvClient.insert({
          doc: mockData.httpDocs.alpha,
          invocationSigner: capabilityAgent.getSigner(),
        });
      } catch(e) {
        err = e;
      }
      assertNoError(err);
      assertions.shouldBeEdvDocument({doc: result});
      // not a comprehensive list
      result.sequence.should.equal(0);
      result.indexed.should.be.an('array');
      result.indexed.should.have.length(1);
      result.indexed[0].attributes.should.be.an('array');
      // no indexed attributes
      result.indexed[0].attributes.should.have.length(0);
    });
    it('should insert a document with attributes', async () => {
      let result;
      let err;
      // instruct client to index documents
      edvClient.ensureIndex({attribute: 'content.apples'});
      const doc = clone(mockData.httpDocs.beta);
      doc.id = await EdvClient.generateId();
      try {
        result = await edvClient.insert({
          doc,
          invocationSigner: capabilityAgent.getSigner(),
        });
      } catch(e) {
        err = e;
      }
      assertNoError(err);
      assertions.shouldBeEdvDocument({doc: result});
      // not a comprehensive list
      result.sequence.should.equal(0);
      result.indexed.should.be.an('array');
      result.indexed.should.have.length(1);
      result.indexed[0].attributes.should.be.an('array');
      // there is one indexed attribute
      result.indexed[0].attributes.should.have.length(1);
    });

    it('should return error on duplicate document', async () => {
      await edvClient.insert({
        doc: mockData.httpDocs.gamma,
        invocationSigner: capabilityAgent.getSigner(),
      });

      // attempt to insert gamma again
      let result;
      let err;
      try {
        result = await edvClient.insert({
          doc: mockData.httpDocs.gamma,
          invocationSigner: capabilityAgent.getSigner(),
        });
      } catch(e) {
        err = e;
      }
      should.not.exist(result);
      should.exist(err);
      err.name.should.equal('DuplicateError');
    });
  }); // end `insert`

  describe('update', () => {
    let capabilityAgent;
    let edvClient;

    before(async () => {
      const secret = '9c727b65-8553-4275-9ac3-0ac89396efc0';
      const handle = 'testKey3';
      capabilityAgent = await CapabilityAgent.fromSecret(
        {secret, handle});

      const keystoreAgent = await helpers.createKeystore({capabilityAgent});

      // corresponds to the passport authenticated user
      const actor = actors['alpha@example.com'];

      ({edvClient} = await helpers.createEdv(
        {actor, capabilityAgent, keystoreAgent, urls}));
    });
    it('should upsert a document', async () => {
      let result;
      let err;
      try {
        result = await edvClient.update({
          doc: mockData.httpDocs.alpha,
          invocationSigner: capabilityAgent.getSigner(),
        });
      } catch(e) {
        err = e;
      }
      assertNoError(err);
      assertions.shouldBeEdvDocument({doc: result});
      result.sequence.should.equal(0);
      result.content.should.eql(mockData.httpDocs.alpha.content);
    });
    it('should update a document', async () => {
      const firstDoc = clone(mockData.httpDocs.beta);
      const insertResult = await edvClient.insert({
        doc: firstDoc,
        invocationSigner: capabilityAgent.getSigner(),
      });

      insertResult.content.apples = 1000;

      let result;
      let err;
      try {
        result = await edvClient.update({
          doc: insertResult,
          invocationSigner: capabilityAgent.getSigner(),
        });
      } catch(e) {
        err = e;
      }
      assertNoError(err);
      assertions.shouldBeEdvDocument({doc: result});
      result.sequence.should.equal(1);
      result.content.should.not.eql(mockData.httpDocs.beta.content);
    });
  }); // end `update`

  describe('update config', () => {
    it('should update an EDV config', async () => {
      const secret = ' b07e6b31-d910-438e-9a5f-08d945a5f678';
      const handle = 'testKey3';
      const {httpsAgent} = brHttpsAgent;

      const capabilityAgent = await CapabilityAgent.fromSecret(
        {secret, handle});

      const keystoreAgent = await helpers.createKeystore({capabilityAgent});
      const invocationSigner = capabilityAgent.getSigner();

      // corresponds to the passport authenticated user
      const actor = actors['alpha@example.com'];

      const {edvClient, edvConfig} = await helpers.createEdv(
        {actor, capabilityAgent, keystoreAgent, urls});

      const config = await EdvClient.findConfigs({
        controller: edvConfig.controller, invocationSigner,
        url: edvClient.id, httpsAgent
      });

      let err;
      try {
        config.sequence++;
        await EdvClient.updateConfig({
          id: config.id, config, httpsAgent
        });
      } catch(e) {
        err = e;
      }
      // no response is returned from sucessful update
      assertNoError(err);
    });
    it('should not update an EDV config with wrong id', async () => {
      const secret = ' b07e6b31-d910-438e-9a5f-08d945a5f678';
      const handle = 'testKey3';
      const {httpsAgent} = brHttpsAgent;

      const capabilityAgent = await CapabilityAgent.fromSecret(
        {secret, handle});

      const keystoreAgent = await helpers.createKeystore({capabilityAgent});
      const invocationSigner = capabilityAgent.getSigner();

      // corresponds to the passport authenticated user
      const actor = actors['alpha@example.com'];

      let edvClient;
      let edvConfig;
      let config;
      let err;
      try {
        ({edvClient, edvConfig} = await helpers.createEdv(
          {actor, capabilityAgent, keystoreAgent, urls}));
        config = await EdvClient.findConfigs({
          controller: edvConfig.controller, invocationSigner,
          url: edvClient.id, httpsAgent
        });
        const url = config.id;
        config.id = '123';
        config.sequence++;
        await EdvClient.updateConfig({
          id: url, config, httpsAgent
        });
      } catch(e) {
        err = e;
      }
      should.exist(err);
      err.data.message.should.equal('Configuration "id" does not match.');
    });
  }); // end `update config`

  describe('get', () => {
    let capabilityAgent;
    let edvClient;

    before(async () => {
      const secret = '6f799a67-45ec-4bc7-960c-c2b79a3c0216';
      const handle = 'testKey4';
      capabilityAgent = await CapabilityAgent.fromSecret(
        {secret, handle});

      const keystoreAgent = await helpers.createKeystore({capabilityAgent});

      // corresponds to the passport authenticated user
      const actor = actors['alpha@example.com'];

      ({edvClient} = await helpers.createEdv(
        {actor, capabilityAgent, keystoreAgent, urls}));
    });
    before(async () => {
      await edvClient.insert({
        doc: mockData.httpDocs.alpha,
        invocationSigner: capabilityAgent.getSigner(),
      });
    });
    it('should get a document', async () => {
      let result;
      let err;
      try {
        result = await edvClient.get({
          id: mockData.httpDocs.alpha.id,
          invocationSigner: capabilityAgent.getSigner(),
        });
      } catch(e) {
        err = e;
      }
      assertNoError(err);
      assertions.shouldBeEdvDocument({doc: result});
      result.sequence.should.equal(0);
      result.content.should.eql(mockData.httpDocs.alpha.content);
    });
    it('SyntaxError on invalid id encoding', async () => {
      let result;
      let err;
      try {
        result = await edvClient.get({
          id: 'does-not-exist',
          invocationSigner: capabilityAgent.getSigner(),
        });
      } catch(e) {
        err = e;
      }
      should.not.exist(result);
      should.exist(err);
      should.exist(err.response);
      err.status.should.equal(400);
      err.data.type.should.equal('SyntaxError');
    });
    it('NotFoundError on unknown id', async () => {
      let result;
      let err;
      try {
        result = await edvClient.get({
          // does not exist
          id: 'z1ABxUcbcnSyMtnenFmeARhxx',
          invocationSigner: capabilityAgent.getSigner(),
        });
      } catch(e) {
        err = e;
      }
      should.not.exist(result);
      should.exist(err);
      err.name.should.equal('NotFoundError');
    });
    it('should get an EDV config', async () => {
      const secret = ' b07e6b31-d910-438e-9a5f-08d945a5f677';
      const handle = 'testKey2';
      const {httpsAgent} = brHttpsAgent;

      const capabilityAgent = await CapabilityAgent.fromSecret(
        {secret, handle});

      const keystoreAgent = await helpers.createKeystore({capabilityAgent});
      const invocationSigner = capabilityAgent.getSigner();

      // corresponds to the passport authenticated user
      const actor = actors['alpha@example.com'];

      let edvClient;
      let edvConfig;
      let config;
      let err;
      try {
        ({edvClient, edvConfig} = await helpers.createEdv(
          {actor, capabilityAgent, keystoreAgent, urls}));
        config = await EdvClient.findConfigs({
          controller: edvConfig.controller, invocationSigner,
          url: edvClient.id, httpsAgent
        });
      } catch(e) {
        err = e;
      }
      should.not.exist(err);
      config.should.be.an('object');
      config.id.should.be.a('string');
      config.id.should.equal(edvClient.id);
    });
    it('should get an EDV', async () => {
      const secret = ' b07e6b31-d910-438e-9a5f-08d945a5f679';
      const handle = 'testKey4';
      const {httpsAgent} = brHttpsAgent;
      const {baseUri} = config.server;
      const root = `${baseUri}/edvs`;

      const capabilityAgent = await CapabilityAgent.fromSecret(
        {secret, handle});

      const keystoreAgent = await helpers.createKeystore({capabilityAgent,
        referenceId: 'test'});
      // corresponds to the passport authenticated user
      const actor = actors['alpha@example.com'];

      let edvConfig;
      let configs;
      let err;
      try {
        ({edvConfig} = await helpers.createEdv(
          {actor, capabilityAgent, keystoreAgent, urls}));
        configs = await EdvClient.findConfigs({
          controller: edvConfig.controller, referenceId: edvConfig.referenceId,
          url: root, httpsAgent
        });
      } catch(e) {
        err = e;
      }
      should.not.exist(err);
      should.exist(configs);
      configs.should.be.an('array');
      configs.should.have.length(1);
      configs[0].controller.should.eql(edvConfig.controller);
      configs[0].referenceId.should.eql(edvConfig.referenceId);
    });
    it('should fail to get an EDV without controller', async () => {
      const {httpsAgent} = brHttpsAgent;
      const {baseUri} = config.server;
      const root = `${baseUri}/edvs`;

      let configs;
      let err;
      try {
        configs = await EdvClient.findConfigs({
          referenceId: 'test', url: root, httpsAgent
        });
      } catch(e) {
        err = e;
      }
      should.not.exist(configs);
      should.exist(err);
      err.data.message.should.equal(
        'A validation error occured in the \'edv query\' validator.');
    });
    it('should fail to get an EDV without referenceId', async () => {
      const {httpsAgent} = brHttpsAgent;
      const {baseUri} = config.server;
      const root = `${baseUri}/edvs`;

      let configs;
      let err;
      try {
        configs = await EdvClient.findConfigs({
          controller: 'urn:uuid:3ff914be-ba55-4332-b2fa-10534977137c',
          url: root, httpsAgent
        });
      } catch(e) {
        err = e;
      }
      should.not.exist(configs);
      should.exist(err);
      err.data.message.should.equal(
        'A validation error occured in the \'edv query\' validator.');
    });
  }); // end `get`

  describe('count', () => {
    let capabilityAgent;
    let edvClient;

    before(async () => {
      const secret = '6bc1fdf9-d454-4853-b776-3641314aa3b8';
      const handle = 'testKey5';
      capabilityAgent = await CapabilityAgent.fromSecret(
        {secret, handle});

      const keystoreAgent = await helpers.createKeystore({capabilityAgent});

      // corresponds to the passport authenticated user
      const actor = actors['alpha@example.com'];

      ({edvClient} = await helpers.createEdv(
        {actor, capabilityAgent, keystoreAgent, urls}));
    });
    before(async () => {
      // instruct client to index documents
      edvClient.ensureIndex({attribute: 'content.apples'});
      edvClient.ensureIndex({
        attribute: ['content.group', 'content.subgroup', 'content.id'],
        unique: true
      });

      await edvClient.insert({
        doc: mockData.httpDocs.alpha,
        invocationSigner: capabilityAgent.getSigner(),
      });

      await edvClient.insert({
        doc: mockData.httpDocs.beta,
        invocationSigner: capabilityAgent.getSigner(),
      });

      await edvClient.insert({
        doc: mockData.httpDocs.gamma,
        invocationSigner: capabilityAgent.getSigner(),
      });

      await edvClient.insert({
        doc: mockData.httpDocs.delta,
        invocationSigner: capabilityAgent.getSigner(),
      });
    });

    it('should count documents using a query', async () => {
      let result1;
      let result2;
      let result3;

      let err;
      try {
        result1 = await edvClient.count({
          has: ['content.apples'],
          count: true,
          invocationSigner: capabilityAgent.getSigner(),
        });

        result2 = await edvClient.count({
          equals: [{'content.apples': mockData.httpDocs.beta.content.apples}],
          count: true,
          invocationSigner: capabilityAgent.getSigner(),
        });

        result3 = await edvClient.count({
          equals: [{'content.foo': 'does-not-exist'}],
          count: true,
          invocationSigner: capabilityAgent.getSigner(),
        });
      } catch(e) {
        err = e;
      }
      assertNoError(err);
      result1.should.be.a('number');
      result1.should.equal(4);

      result2.should.be.a('number');
      result2.should.equal(1);

      result3.should.be.a('number');
      result3.should.equal(0);
    });
  });

  describe('find', () => {
    let capabilityAgent;
    let edvClient;

    before(async () => {
      const secret = '6bc1fdf9-d454-4853-b776-3641314aa3b8';
      const handle = 'testKey5';
      capabilityAgent = await CapabilityAgent.fromSecret(
        {secret, handle});

      const keystoreAgent = await helpers.createKeystore({capabilityAgent});

      // corresponds to the passport authenticated user
      const actor = actors['alpha@example.com'];

      ({edvClient} = await helpers.createEdv(
        {actor, capabilityAgent, keystoreAgent, urls}));
    });
    before(async () => {
      // instruct client to index documents
      edvClient.ensureIndex({attribute: 'content.apples'});
      edvClient.ensureIndex({
        attribute: ['content.group', 'content.subgroup', 'content.id'],
        unique: true
      });

      await edvClient.insert({
        doc: mockData.httpDocs.alpha,
        invocationSigner: capabilityAgent.getSigner(),
      });

      await edvClient.insert({
        doc: mockData.httpDocs.beta,
        invocationSigner: capabilityAgent.getSigner(),
      });

      await edvClient.insert({
        doc: mockData.httpDocs.gamma,
        invocationSigner: capabilityAgent.getSigner(),
      });

      await edvClient.insert({
        doc: mockData.httpDocs.delta,
        invocationSigner: capabilityAgent.getSigner(),
      });
    });
    it('should get a document by attribute', async () => {
      // NOTE: the client was instructed to index the `content.apples` attribute
      // before the documents were inserted
      let result;
      let err;
      try {
        result = await edvClient.find({
          has: ['content.apples'],
          invocationSigner: capabilityAgent.getSigner(),
        });
      } catch(e) {
        err = e;
      }
      const {documents} = result;
      assertNoError(err);
      documents.should.be.an('array');
      documents.should.have.length(4);
      const alpha = documents.find(r => r.id === mockData.httpDocs.alpha.id);
      assertions.shouldBeEdvDocument({doc: alpha});
      alpha.content.should.eql(mockData.httpDocs.alpha.content);
      const beta = documents.find(r => r.id === mockData.httpDocs.beta.id);
      assertions.shouldBeEdvDocument({doc: beta});
      beta.content.should.eql(mockData.httpDocs.beta.content);
      const gamma = documents.find(r => r.id === mockData.httpDocs.gamma.id);
      assertions.shouldBeEdvDocument({doc: gamma});
      gamma.content.should.eql(mockData.httpDocs.gamma.content);
      const delta = documents.find(r => r.id === mockData.httpDocs.delta.id);
      assertions.shouldBeEdvDocument({doc: delta});
      delta.content.should.eql(mockData.httpDocs.delta.content);
    });
    it('should get a document count when count is set to true', async () => {
      let result1;
      let result2;
      let result3;

      let err;
      try {
        result1 = await edvClient.find({
          has: ['content.apples'],
          count: true,
          invocationSigner: capabilityAgent.getSigner(),
        });

        result2 = await edvClient.find({
          equals: [{'content.apples': mockData.httpDocs.beta.content.apples}],
          count: true,
          invocationSigner: capabilityAgent.getSigner(),
        });

        result3 = await edvClient.find({
          equals: [{'content.foo': 'does-not-exist'}],
          count: true,
          invocationSigner: capabilityAgent.getSigner(),
        });
      } catch(e) {
        err = e;
      }
      assertNoError(err);
      result1.should.be.an('object');
      result1.should.have.keys('count');
      result1.count.should.equal(4);

      result2.should.be.an('object');
      result2.should.have.keys('count');
      result2.count.should.equal(1);

      result3.should.be.an('object');
      result3.should.have.keys('count');
      result3.count.should.equal(0);
    });

    it('should get a document by attribute and value', async () => {
      // both alpha and beta have `apples` attribute
      let result;
      let err;
      try {
        result = await edvClient.find({
          equals: [{'content.apples': mockData.httpDocs.beta.content.apples}],
          invocationSigner: capabilityAgent.getSigner(),
        });
      } catch(e) {
        err = e;
      }
      const {documents} = result;
      assertNoError(err);
      documents.should.be.an('array');
      documents.should.have.length(1);
      assertions.shouldBeEdvDocument({doc: documents[0]});
      documents[0].content.should.eql(mockData.httpDocs.beta.content);
      documents[0].id.should.equal(mockData.httpDocs.beta.id);
    });
    it('should get a document by attribute and value where multiple values ' +
      'exist for an attribute via an array', async () => {
      // both alpha and beta have `apples` attribute
      let result;
      let err;
      try {
        result = await edvClient.find({
          equals: [{
            'content.apples': mockData.httpDocs.alpha.content.apples[1]
          }],
          invocationSigner: capabilityAgent.getSigner(),
        });
      } catch(e) {
        err = e;
      }
      const {documents} = result;
      assertNoError(err);
      documents.should.be.an('array');
      documents.should.have.length(1);
      assertions.shouldBeEdvDocument({doc: documents[0]});
      documents[0].content.should.eql(mockData.httpDocs.alpha.content);
      documents[0].id.should.equal(mockData.httpDocs.alpha.id);
    });
    it('should find no results on non-indexed attribute', async () => {
      let result;
      let err;
      try {
        result = await edvClient.find({
          equals: [{'content.foo': 'does-not-exist'}],
          invocationSigner: capabilityAgent.getSigner(),
        });
      } catch(e) {
        err = e;
      }
      const {documents} = result;
      assertNoError(err);
      documents.should.be.an('array');
      documents.should.have.length(0);
    });
    it('should get a document by attribute 1 in a compound index', async () => {
      // NOTE: the client was instructed to create a compound index
      // with ['content.group', 'content.subgroup', 'content.id']
      // before the documents were inserted
      let result;
      let err;
      try {
        result = await edvClient.find({
          has: ['content.group'],
          invocationSigner: capabilityAgent.getSigner(),
        });
      } catch(e) {
        err = e;
      }
      const {documents} = result;
      assertNoError(err);
      documents.should.be.an('array');
      documents.should.have.length(3);
      const alpha = documents.find(r => r.id === mockData.httpDocs.alpha.id);
      assertions.shouldBeEdvDocument({doc: alpha});
      alpha.content.should.eql(mockData.httpDocs.alpha.content);
      const beta = documents.find(r => r.id === mockData.httpDocs.beta.id);
      assertions.shouldBeEdvDocument({doc: beta});
      beta.content.should.eql(mockData.httpDocs.beta.content);
      const gamma = documents.find(r => r.id === mockData.httpDocs.gamma.id);
      assertions.shouldBeEdvDocument({doc: gamma});
      gamma.content.should.eql(mockData.httpDocs.gamma.content);
    });
    it('should get a document by attribute 1 and value via compound index',
      async () => {
        // both alpha and beta and gamma are in the same group
        let result;
        let err;
        try {
          result = await edvClient.find({
            equals: [{'content.group': 'group1'}],
            invocationSigner: capabilityAgent.getSigner(),
          });
        } catch(e) {
          err = e;
        }
        const {documents} = result;
        assertNoError(err);
        documents.should.be.an('array');
        documents.should.have.length(3);
        const alpha = documents.find(r => r.id === mockData.httpDocs.alpha.id);
        assertions.shouldBeEdvDocument({doc: alpha});
        alpha.content.should.eql(mockData.httpDocs.alpha.content);
        const beta = documents.find(r => r.id === mockData.httpDocs.beta.id);
        assertions.shouldBeEdvDocument({doc: beta});
        beta.content.should.eql(mockData.httpDocs.beta.content);
        const gamma = documents.find(r => r.id === mockData.httpDocs.gamma.id);
        assertions.shouldBeEdvDocument({doc: gamma});
        gamma.content.should.eql(mockData.httpDocs.gamma.content);
      });
    it('should get a document by attribute 2 in a compound index', async () => {
      // NOTE: the client was instructed to create a compound index
      // with ['content.group', 'content.subgroup', 'content.id']
      // before the documents were inserted
      let result;
      let err;
      try {
        result = await edvClient.find({
          has: ['content.subgroup'],
          invocationSigner: capabilityAgent.getSigner(),
        });
      } catch(e) {
        err = e;
      }
      const {documents} = result;
      assertNoError(err);
      documents.should.be.an('array');
      documents.should.have.length(3);
      const alpha = documents.find(r => r.id === mockData.httpDocs.alpha.id);
      assertions.shouldBeEdvDocument({doc: alpha});
      alpha.content.should.eql(mockData.httpDocs.alpha.content);
      const beta = documents.find(r => r.id === mockData.httpDocs.beta.id);
      assertions.shouldBeEdvDocument({doc: beta});
      beta.content.should.eql(mockData.httpDocs.beta.content);
      const gamma = documents.find(r => r.id === mockData.httpDocs.gamma.id);
      assertions.shouldBeEdvDocument({doc: gamma});
      gamma.content.should.eql(mockData.httpDocs.gamma.content);
    });
    it('should get a document by attribute 2 and value via compound index',
      async () => {
        // both alpha and beta and gamma are in the same group
        let result;
        let err;
        try {
          result = await edvClient.find({
            equals: [{
              'content.group': 'group1',
              'content.subgroup': 'subgroup1'
            }],
            invocationSigner: capabilityAgent.getSigner(),
          });
        } catch(e) {
          err = e;
        }
        const {documents} = result;
        assertNoError(err);
        documents.should.be.an('array');
        documents.should.have.length(2);
        const alpha = documents.find(r => r.id === mockData.httpDocs.alpha.id);
        assertions.shouldBeEdvDocument({doc: alpha});
        alpha.content.should.eql(mockData.httpDocs.alpha.content);
        const beta = documents.find(r => r.id === mockData.httpDocs.beta.id);
        assertions.shouldBeEdvDocument({doc: beta});
        beta.content.should.eql(mockData.httpDocs.beta.content);
      });
    it('should get a document by attribute 3 and value via compound index',
      async () => {
        // both alpha and beta and gamma are in the same group
        let result;
        let err;
        try {
          result = await edvClient.find({
            equals: [{
              'content.group': 'group1',
              'content.subgroup': 'subgroup1',
              'content.id': 'alpha'
            }],
            invocationSigner: capabilityAgent.getSigner(),
          });
        } catch(e) {
          err = e;
        }
        const {documents} = result;
        assertNoError(err);
        documents.should.be.an('array');
        documents.should.have.length(1);
        const alpha = documents.find(r => r.id === mockData.httpDocs.alpha.id);
        assertions.shouldBeEdvDocument({doc: alpha});
        alpha.content.should.eql(mockData.httpDocs.alpha.content);
      });
  }); // end `find`
  describe('capabilities', () => {
    let testers = null;
    beforeEach(async () => {
      testers = await helpers.makeDelegationTesters({
        testers: ['alice', 'bob', 'carol'],
        mockData
      });
    });
    it('should enable a capability', async () => {
      // corresponds to the passport authenticated user
      const actor = actors['alpha@example.com'];
      let result;
      let err;
      const {edvClient: aliceEdvClient} = await helpers.createEdv({
        actor,
        capabilityAgent: testers.alice.capabilityAgent,
        keystoreAgent: testers.alice.keystoreAgent,
        urls
      });
      const allowedAction = 'write';
      const doc = clone(mockData.httpDocs.alpha);
      doc.id = await EdvClient.generateId();
      const invocationSigner = testers.alice.capabilityAgent.getSigner();
      // alice delegates a `write` capability to bob with bob as a delegator
      // this will be stored in authorizations
      const writeZcap = {
        allowedAction,
        invoker: testers.bob.verificationKey.id,
        delegator: testers.bob.verificationKey.id,
        // Documents are not zCaps so this route stores all zCaps
        // for a document.
        parentCapability: `${aliceEdvClient.id}/zcaps/documents/${doc.id}`,
        invocationTarget: {
          type: 'urn:datahub:document',
          id: `${aliceEdvClient.id}/documents/${doc.id}`
        }
      };
      try {
        result = await aliceEdvClient.insert({
          doc,
          recipients: [
            {
              header: {
                alg: helpers.JWE_ALG,
                kid: testers.alice.keyAgreementKey.id
              }
            },
            {
              header: {
                alg: helpers.JWE_ALG,
                kid: testers.bob.keyAgreementKey.id
              }
            }
          ],
          invocationSigner
        });
        const capabilityToEnable = await helpers.delegate({
          zcap: writeZcap,
          signer: invocationSigner,
          capabilityChain: [`${aliceEdvClient.id}/zcaps/documents/${doc.id}`]
        });
        assertions.shouldBeCapability({capability: capabilityToEnable});
        await aliceEdvClient.enableCapability(
          {capabilityToEnable, invocationSigner});
      } catch(e) {
        err = e;
      }
      assertNoError(err);
      assertions.shouldBeEdvDocument({doc: result});
    });
  }); // end capabilities
  describe('delete', () => {
    let capabilityAgent;
    let edvClient;

    before(async () => {
      const secret = 'bbe5e472-f8ff-4ea8-8004-f04a63d641e6';
      const handle = 'testKey6';
      capabilityAgent = await CapabilityAgent.fromSecret(
        {secret, handle});

      const keystoreAgent = await helpers.createKeystore({capabilityAgent});

      // corresponds to the passport authenticated user
      const actor = actors['alpha@example.com'];

      ({edvClient} = await helpers.createEdv(
        {actor, capabilityAgent, keystoreAgent, urls}));
    });
    it('should delete a document', async () => {
      await edvClient.insert({
        doc: mockData.httpDocs.alpha,
        invocationSigner: capabilityAgent.getSigner(),
      });
      const doc = await edvClient.get({
        id: mockData.httpDocs.alpha.id,
        invocationSigner: capabilityAgent.getSigner(),
      });
      let result;
      let err;
      try {
        result = await edvClient.delete({
          doc,
          invocationSigner: capabilityAgent.getSigner(),
        });
      } catch(e) {
        err = e;
      }
      assertNoError(err);
      result.should.be.a('boolean');
      result.should.be.true;

      // should return document with content as an empty object and
      // 'meta.deleted' as true
      let getResult;
      try {
        getResult = await edvClient.get({
          id: mockData.httpDocs.alpha.id,
          invocationSigner: capabilityAgent.getSigner(),
        });
      } catch(e) {
        err = e;
      }
      should.exist(getResult);
      assertNoError(err);
      getResult.content.should.be.an('object');
      getResult.meta.deleted.should.equal(true);
    });
  }); // end `delete`
}); // end bedrock-edv-storage
