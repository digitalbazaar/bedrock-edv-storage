/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');
const brEdvStorage = require('bedrock-edv-storage');
const database = require('bedrock-mongodb');
const helpers = require('./helpers');
const {httpClient} = require('@digitalbazaar/http-client');
const mockData = require('./mock.data');
const {agent} = require('bedrock-https-agent');
const {createHeaderValue} = require('@digitalbazaar/http-digest-header');

let actors;
let accounts;

const mockEdvId = `${config.server.baseUri}/edvs/z19xXoFRcobgskDQ6ywrRaa16`;
const hashedMockEdvId = database.hash(mockEdvId);

describe('update API', () => {
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
  it('should upsert a document', async () => {
    const actor = actors['alpha@example.com'];
    await brEdvStorage.update({actor, edvId: mockEdvId, doc: mockData.doc2});
    const record = await database.collections.edvDoc.findOne({
      edvId: hashedMockEdvId,
      id: database.hash(mockData.doc2.id)
    });
    should.exist(record);
    record.doc.should.eql(mockData.doc2);
  });
  it('should update a document', async () => {
    const actor = actors['alpha@example.com'];
    const doc = {...mockData.doc1, sequence: 1};
    await brEdvStorage.update({actor, edvId: mockEdvId, doc});
    const record = await database.collections.edvDoc.findOne({
      edvId: hashedMockEdvId,
      id: database.hash(mockData.doc1.id)
    });
    record.doc.should.eql(doc);
  });
  it('should fail to update a document with max safe sequence', async () => {
    let error;
    const actor = actors['alpha@example.com'];
    const doc = {...mockData.doc1, sequence: Number.MAX_SAFE_INTEGER};
    try {
      await brEdvStorage.update({actor, edvId: mockEdvId, doc});
      await database.collections.edvDoc.findOne({
        edvId: hashedMockEdvId,
        id: database.hash(mockData.doc1.id)
      });
    } catch(e) {
      error = e;
    }
    should.exist(error);
    error.name.should.equal('TypeError');
    error.message.should.equal(
      '"doc.sequence" number is too large.');
  });
  it('should fail to update document with unmatching ids',
    async () => {
      const actor = actors['alpha@example.com'];
      const {doc1} = mockData;
      const doc = {...doc1};
      doc.id = await helpers.generateRandom();
      const record = await brEdvStorage.insert({
        actor,
        edvId: mockEdvId,
        doc,
      });
      const newid = await helpers.generateRandom();
      const url = `${mockEdvId}/documents/${newid}`;
      let err;
      try {
        const digest = await createHeaderValue({
          data: record.doc, useMultihash: true
        });
        await httpClient.post(url, {
          json: record.doc,
          agent,
          headers: {
            digest
          }
        });
      } catch(e) {
        err = e;
      }
      should.exist(err);
      err.data.message.should.equal(
        'Could not update document; ID does not match.');
    });
  // FIXME: the current implementation does not check edv id
  // see: https://github.com/digitalbazaar/bedrock-edv-storage/issues/12
  it.skip('should fail for another EDV', async () => {
    const actor = actors['alpha@example.com'];
    let err;
    let record;
    try {
      record = await brEdvStorage.update({
        actor,
        edvId: 'urn:uuid:something-else',
        doc: mockData.doc1
      });
    } catch(e) {
      err = e;
    }
    should.exist(err);
    should.not.exist(record);
    err.name.should.equal('PermissionDenied');
  });
}); // end `update`
