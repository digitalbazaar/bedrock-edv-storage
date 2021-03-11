/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const brEdvStorage = require('bedrock-edv-storage');
const database = require('bedrock-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');
let actors;
let accounts;

describe('insertConfig API', () => {
  before(async () => {
    await helpers.prepareDatabase(mockData);
    actors = await helpers.getActors(mockData);
    accounts = mockData.accounts;
  });
  it('should insert an EDV config', async () => {
    const actor = actors['alpha@example.com'];
    const account = accounts['alpha@example.com'].account;
    const edvConfig = {...mockData.config, controller: account.id};
    let record = await brEdvStorage.insertConfig({actor, config: edvConfig});
    should.exist(record);
    record.controller.should.equal(database.hash(account.id));
    record.id.should.equal(database.hash(record.config.id));
    record.config.should.eql(edvConfig);
    record = await database.collections.edvConfig.findOne({
      id: database.hash(edvConfig.id)
    });
    record.controller.should.equal(database.hash(account.id));
    record.config.should.eql(edvConfig);
  });
  // FIXME: since the user has admin rights ATM, this test is producing
  // a duplicate error
  it.skip('should fail for another EDV', async () => {
    const actor = actors['alpha@example.com'];
    let err;
    let record;
    try {
      const edvConfig = {
        ...mockData.config,
        controller: 'urn:uuid:something-else'
      };
      record = await brEdvStorage.insertConfig({actor, config: edvConfig});
    } catch(e) {
      err = e;
    }
    should.exist(err);
    should.not.exist(record);
    err.name.should.equal('PermissionDenied');
  });
}); // end `insertConfig`
