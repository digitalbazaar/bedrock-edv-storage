/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');
const brEdvStorage = require('bedrock-edv-storage');
const helpers = require('./helpers');
const mockData = require('./mock.data');
let actors;
let accounts;

const mockEdvId = `${config.server.baseUri}/edvs/z19xXoFRcobgskDQ6ywrRaa14`;

describe('get API', () => {
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
    const {doc1: doc} = mockData;
    await brEdvStorage.insert({
      actor,
      edvId: mockEdvId,
      doc,
    });
  });
  it('should get a document', async () => {
    const actor = actors['alpha@example.com'];
    const record = await brEdvStorage.get({
      actor,
      edvId: mockEdvId,
      id: mockData.doc1.id
    });
    should.exist(record);
    record.doc.should.eql({...mockData.doc1});
  });
  // FIXME: current implementation does not check evd id
  // see: https://github.com/digitalbazaar/bedrock-edv-storage/issues/12
  it.skip('should fail for another EDV', async () => {
    const actor = actors['alpha@example.com'];
    let err;
    let record;
    try {
      record = await brEdvStorage.get({
        actor,
        edvId: 'urn:uuid:something-else',
        id: mockData.doc1.id
      });
    } catch(e) {
      err = e;
    }
    should.exist(err);
    should.not.exist(record);
    err.name.should.equal('PermissionDenied');
  });
  it('should get not found error', async () => {
    const actor = actors['alpha@example.com'];
    let err;
    let record;
    try {
      record = await brEdvStorage.get({
        actor,
        edvId: mockEdvId,
        // there is no document with this id
        id: 'z19pjdSMQMkBqqJ5zsaagncfX'
      });
    } catch(e) {
      err = e;
    }
    should.exist(err);
    should.not.exist(record);
    err.name.should.equal('NotFoundError');
  });
}); // end `get`
