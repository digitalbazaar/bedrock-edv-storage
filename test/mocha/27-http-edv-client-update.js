/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

require('bedrock-edv-storage');
const bedrock = require('bedrock');
const {config} = bedrock;
const helpers = require('./helpers');
const mockData = require('./mock.data');
const {CapabilityAgent} = require('webkms-client');
let actors;
let urls;

const brEdvStorage = require('bedrock-edv-storage');
const mockEdvId = `${config.server.baseUri}/edvs/z19xXoFRcobgskDQ6ywrRaa12`;

describe('bedrock-edv-storage HTTP API - edv-client update', () => {
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
    //using the sequenceNumberTests from helpers
    for(const test of helpers.sequenceNumberTests) {
      it(test.updateTitle, async () => {
        const actor = actors['alpha@example.com'];
        const {doc1} = mockData;
        const doc = {...doc1};
        doc.id = await helpers.generateRandom();
        doc.sequence = test.sequence;
        const record = await brEdvStorage.insert({
          actor,
          edvId: mockEdvId,
          doc,
        });

        record.doc.content = {};
        record.doc.jwe.recipients = [];

        let result;
        let err;
        try {
          result = await edvClient.update({
            doc: record.doc,
            invocationSigner: capabilityAgent.getSigner(),
          });
        } catch(e) {
          console.dir(e);
          err = e;
        }
        assertNoError(err);
        result.sequence.should.equal(doc.sequence + 1);
      });
    }
  });
});
