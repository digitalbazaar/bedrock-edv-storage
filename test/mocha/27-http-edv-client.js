/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

require('bedrock-edv-storage');
const bedrock = require('bedrock');
const brEdvStorage = require('bedrock-edv-storage');
const {util: {clone}} = bedrock;
const {config} = bedrock;
const helpers = require('./helpers');
const assertions = require('./assertions');
const mockData = require('./mock.data');
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

  describe('update API', () => {
    let capabilityAgent;
    let edvClient;
    let accounts;
    const mockEdvId = `${config.server.baseUri}/edvs/z19xXoFRcobgskDQ6ywrRaa12`;
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
    before(async () => {
      const secret = 'e4f2f31d-b21a-427e-b49a-b4447d5bb219';
      const handle = 'testKey4';
      capabilityAgent = await CapabilityAgent.fromSecret(
        {secret, handle});

      const keystoreAgent = await helpers.createKeystore({capabilityAgent});

      // corresponds to the passport authenticated user
      const actor = actors['alpha@example.com'];

      ({edvClient} = await helpers.createEdv(
        {actor, capabilityAgent, keystoreAgent, urls}));
    });

    for(const test of helpers.sequenceNumberTests({update: true})) {
      it(test.title, async () => {
        let result;
        let err;
        const actor = actors['alpha@example.com'];
        const doc = clone(mockData.docWithNoIndexedOrRecipients);
        doc.id = await helpers.generateRandom();
        doc.sequence = test.sequence;
        doc.content = {
          foo: 'bar'
        };
        const record = await brEdvStorage.insert({
          actor,
          edvId: mockEdvId,
          doc,
        });
        should.exist(record);
        record.doc.content.apples = test.sequence;
        try {
          result = await edvClient.update({
            doc: record.doc,
            invocationSigner: capabilityAgent.getSigner()
          });
        } catch(e) {
          err = e;
        }
        should.exist(result);
        assertNoError(err);
        assertions.shouldBeEdvDocument({doc: result});
        result.sequence.should.equal(test.sequence + 1);
        result.content.should.eql(record.doc.content);
      });
    }

    it('should not update a sequence number greater than MAX_SAFE_INTEGER',
      async () => {
        let error, result = null;
        try {
          const actor = actors['alpha@example.com'];
          const doc = clone(mockData.docWithNoIndexedOrRecipients);
          doc.id = await helpers.generateRandom();
          doc.sequence = Number.MAX_SAFE_INTEGER;
          doc.content = {
            foo: 'bar'
          };
          const record = await brEdvStorage.insert({
            actor,
            edvId: mockEdvId,
            doc
          });
          should.exist(record);
          record.doc.content.oranges = 1;
          result = await edvClient.update({
            doc: record.doc,
            invocationSigner: capabilityAgent.getSigner()
          });
        } catch(e) {
          error = e;
        }
        console.log(result.sequence);
        should.not.exist(result);
        should.exist(error);
        error.name.should.equal('Error');
        error.message.should.equal(
          '"doc.sequence" must be less than MAX_SAFE_INTEGER'
        );
      });
  });
});
