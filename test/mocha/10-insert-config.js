/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const brEdvStorage = require('bedrock-edv-storage');
const database = require('bedrock-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');

describe('edvs.insert API', () => {
  before(async () => {
    await helpers.prepareDatabase();
  });
  it('should insert an EDV config', async () => {
    const edvConfig = {...mockData.config};
    let record = await brEdvStorage.edvs.insert({config: edvConfig});
    should.exist(record);
    record.config.should.eql(edvConfig);
    record = await database.collections['edv-storage-config'].findOne({
      'config.id': edvConfig.id
    });
    record.config.should.eql(edvConfig);
  });
}); // end `edvs.insert API`
