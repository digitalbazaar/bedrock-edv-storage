/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');
const brEdvStorage = require('bedrock-edv-storage');
const database = require('bedrock-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');
let actors;
let accounts;

const mockEdvId = `${config.server.baseUri}/edvs/z19xXoFRcobgskDQ6ywrRaa16`;
const hashedMockEdvId = database.hash(mockEdvId);

describe('remove API', () => {
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
  it('should remove a document', async () => {
    const actor = actors['alpha@example.com'];
    const result = await brEdvStorage.remove({
      actor,
      edvId: mockEdvId,
      id: mockData.doc1.id
    });
    should.exist(result);
    result.should.equal(true);
    const record = await database.collections.edvDoc.findOne({
      edvId: hashedMockEdvId,
      id: database.hash(mockData.doc1.id)
    });
    should.exist(record);
    record.doc.deleted.should.equal(true);
  });
  it('should return `false` for a missing document', async () => {
    const actor = actors['alpha@example.com'];
    const result = await brEdvStorage.remove({
      actor,
      edvId: mockEdvId,
      // there is no document with this id
      id: 'z19pjdSMQMkBqqJ5zsaagncfX'
    });
    should.exist(result);
    result.should.equal(false);
  });
  // FIXME: the current implementation does not check evd id
  // see: https://github.com/digitalbazaar/bedrock-edv-storage/issues/12
  it.skip('should fail for another EDV', async () => {
    const actor = actors['alpha@example.com'];
    let err;
    let records;
    try {
      records = await brEdvStorage.remove({
        actor,
        edvId: 'urn:uuid:something-else',
        id: mockData.doc1.id
      });
    } catch(e) {
      err = e;
    }
    should.exist(err);
    should.not.exist(records);
    err.name.should.equal('PermissionDenied');
  });
}); // end `remove`
