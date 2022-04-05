/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
import * as brEdvStorage from '@bedrock/edv-storage';
import * as helpers from './helpers.js';
import {config} from '@bedrock/core';
import {mockData} from './mock.data.js';
import {createRequire} from 'module';
const require = createRequire(import.meta.url);
const {CapabilityAgent} = require('@digitalbazaar/webkms-client');

let urls;
const mockEdvId = `${config.server.baseUri}/edvs/z19xXoFRcobgskDQ6ywrRaa12`;

describe('bedrock-edv-storage HTTP API - edv-client update', () => {
  before(async () => {
    await helpers.prepareDatabase();
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

  describe('update', () => {
    let capabilityAgent;
    let edvClient;

    before(async () => {
      const secret = '9c727b65-8553-4275-9ac3-0ac89396efc0';
      const handle = 'testKey3';
      capabilityAgent = await CapabilityAgent.fromSecret({secret, handle});

      const keystoreAgent = await helpers.createKeystore({capabilityAgent});

      ({edvClient} = await helpers.createEdv(
        {capabilityAgent, keystoreAgent, urls}));
    });
    // using the sequenceNumberTests from helpers
    for(const test of helpers.sequenceNumberTests) {
      it(test.updateTitle, async () => {
        const {doc1} = mockData;
        const doc = {...doc1};
        doc.id = await helpers.generateRandom();
        doc.sequence = test.sequence;
        const record = await brEdvStorage.insert({
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
          err = e;
        }
        assertNoError(err);
        result.sequence.should.equal(doc.sequence + 1);
      });
    }
    it('should fail to update a document to max safe sequence number',
      async () => {
        const {doc1} = mockData;
        const doc = {...doc1};
        doc.id = await helpers.generateRandom();
        doc.sequence = Number.MAX_SAFE_INTEGER - 1;
        const record = await brEdvStorage.insert({
          edvId: mockEdvId,
          doc,
        });

        record.doc.content = {};
        record.doc.jwe.recipients = [];

        let err;
        try {
          await edvClient.update({
            doc: record.doc,
            invocationSigner: capabilityAgent.getSigner(),
          });
        } catch(e) {
          err = e;
        }
        should.exist(err);
        err.message.should.equal(
          '"sequence" is too large.');
      });
    it('should increase sequence when updating a deleted document',
      async () => {
        await edvClient.insert({
          doc: mockData.httpDocs.alpha,
          invocationSigner: capabilityAgent.getSigner(),
        });
        const doc = await edvClient.get({
          id: mockData.httpDocs.alpha.id,
          invocationSigner: capabilityAgent.getSigner(),
        });
        // delete doc
        await edvClient.delete({
          doc,
          invocationSigner: capabilityAgent.getSigner()
        });
        // get doc
        const record = await edvClient.get({
          id: mockData.httpDocs.alpha.id,
          invocationSigner: capabilityAgent.getSigner(),
        });
        should.exist(record);
        record.sequence.should.equal(1);
      });
  });
});
