/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as brEdvStorage from '@bedrock/edv-storage';
import * as database from '@bedrock/mongodb';
import * as helpers from './helpers.js';
import {mockData} from './mock.data.js';

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
