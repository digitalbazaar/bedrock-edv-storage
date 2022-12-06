/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as brEdvStorage from '@bedrock/edv-storage';
import * as database from '@bedrock/mongodb';
import * as helpers from './helpers.js';
import {mockData} from './mock.data.js';
import {v4 as uuid} from 'uuid';

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
  it('should fail with a duplicate config ID', async () => {
    const edvConfig = {...mockData.config};
    edvConfig.id = await helpers.generateRandom();

    {
      let record = await brEdvStorage.edvs.insert({config: edvConfig});
      should.exist(record);
      record.config.should.eql(edvConfig);
      record = await database.collections['edv-storage-config'].findOne({
        'config.id': edvConfig.id
      });
      record.config.should.eql(edvConfig);
    }

    {
      let err = null;
      try {
        await brEdvStorage.edvs.insert({config: edvConfig});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      err.name.should.equal('DuplicateError');
    }
  });
  it('should insert an EDV config with a reference ID', async () => {
    const edvConfig = {...mockData.config};
    edvConfig.id = await helpers.generateRandom();
    edvConfig.referenceId = uuid();
    let record = await brEdvStorage.edvs.insert({config: edvConfig});
    should.exist(record);
    record.config.should.eql(edvConfig);
    record = await database.collections['edv-storage-config'].findOne({
      'config.id': edvConfig.id
    });
    record.config.should.eql(edvConfig);
    record = await database.collections['edv-storage-referenceId'].findOne({
      controller: edvConfig.controller,
      referenceId: edvConfig.referenceId,
      configId: edvConfig.id
    });
    should.exist(record);
  });
  it('should fail with a duplicate config ID w/reference ID', async () => {
    const edvConfig = {...mockData.config};
    edvConfig.id = await helpers.generateRandom();
    edvConfig.referenceId = uuid();

    {
      let record = await brEdvStorage.edvs.insert({config: edvConfig});
      should.exist(record);
      record.config.should.eql(edvConfig);
      record = await database.collections['edv-storage-config'].findOne({
        'config.id': edvConfig.id
      });
      record.config.should.eql(edvConfig);
      record = await database.collections['edv-storage-referenceId'].findOne({
        controller: edvConfig.controller,
        referenceId: edvConfig.referenceId,
        configId: edvConfig.id
      });
      should.exist(record);
    }

    {
      let err = null;
      try {
        await brEdvStorage.edvs.insert({config: edvConfig});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      err.name.should.equal('DuplicateError');
    }
  });
  it('should fail with a duplicate reference ID', async () => {
    const edvConfig = {...mockData.config};
    edvConfig.id = await helpers.generateRandom();
    edvConfig.referenceId = uuid();

    {
      let record = await brEdvStorage.edvs.insert({config: edvConfig});
      should.exist(record);
      record.config.should.eql(edvConfig);
      record = await database.collections['edv-storage-config'].findOne({
        'config.id': edvConfig.id
      });
      record.config.should.eql(edvConfig);
      record = await database.collections['edv-storage-referenceId'].findOne({
        controller: edvConfig.controller,
        referenceId: edvConfig.referenceId,
        configId: edvConfig.id
      });
      should.exist(record);
    }

    {
      edvConfig.id = await helpers.generateRandom();
      let err = null;
      try {
        await brEdvStorage.edvs.insert({config: edvConfig});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      err.name.should.equal('DuplicateError');
    }
  });
  it('should pass with a false-positive duplicate reference ID', async () => {
    const edvConfig = {...mockData.config};
    edvConfig.id = await helpers.generateRandom();
    edvConfig.referenceId = uuid();

    {
      let record = await brEdvStorage.edvs.insert({config: edvConfig});
      should.exist(record);
      record.config.should.eql(edvConfig);
      record = await database.collections['edv-storage-config'].findOne({
        'config.id': edvConfig.id
      });
      record.config.should.eql(edvConfig);
      record = await database.collections['edv-storage-referenceId'].findOne({
        controller: edvConfig.controller,
        referenceId: edvConfig.referenceId,
        configId: edvConfig.id
      });
      should.exist(record);
    }

    // now remove config record manually (to avoid cleaning up its reference
    // ID mapping)
    await database.collections['edv-storage-config'].deleteOne(
      {'config.id': edvConfig.id});

    {
      edvConfig.id = await helpers.generateRandom();
      let record = await brEdvStorage.edvs.insert({config: edvConfig});
      should.exist(record);
      record.config.should.eql(edvConfig);
      record = await database.collections['edv-storage-config'].findOne({
        'config.id': edvConfig.id
      });
      record.config.should.eql(edvConfig);
      record = await database.collections['edv-storage-referenceId'].findOne({
        controller: edvConfig.controller,
        referenceId: edvConfig.referenceId,
        configId: edvConfig.id
      });
      should.exist(record);
    }

    // now inserting should produce a duplicate error
    {
      edvConfig.id = await helpers.generateRandom();
      let err = null;
      try {
        await brEdvStorage.edvs.insert({config: edvConfig});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      err.name.should.equal('DuplicateError');
    }
  });
  it('should pass after removal w/ duplicate reference ID', async () => {
    const edvConfig = {...mockData.config};
    edvConfig.id = await helpers.generateRandom();
    edvConfig.referenceId = uuid();

    {
      let record = await brEdvStorage.edvs.insert({config: edvConfig});
      should.exist(record);
      record.config.should.eql(edvConfig);
      record = await database.collections['edv-storage-config'].findOne({
        'config.id': edvConfig.id
      });
      record.config.should.eql(edvConfig);
      record = await database.collections['edv-storage-referenceId'].findOne({
        controller: edvConfig.controller,
        referenceId: edvConfig.referenceId,
        configId: edvConfig.id
      });
      should.exist(record);
    }

    {
      const result = await brEdvStorage.edvs.remove({id: edvConfig.id});
      result.should.equal(true);
    }

    {
      edvConfig.id = await helpers.generateRandom();
      let record = await brEdvStorage.edvs.insert({config: edvConfig});
      should.exist(record);
      record.config.should.eql(edvConfig);
      record = await database.collections['edv-storage-config'].findOne({
        'config.id': edvConfig.id
      });
      record.config.should.eql(edvConfig);
      record = await database.collections['edv-storage-referenceId'].findOne({
        controller: edvConfig.controller,
        referenceId: edvConfig.referenceId,
        configId: edvConfig.id
      });
      should.exist(record);
    }

    // now inserting should produce a duplicate error
    {
      edvConfig.id = await helpers.generateRandom();
      let err = null;
      try {
        await brEdvStorage.edvs.insert({config: edvConfig});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      err.name.should.equal('DuplicateError');
    }
  });
  it('should not find pending insert', async () => {
    const edvConfig = {...mockData.config};
    edvConfig.id = await helpers.generateRandom();
    edvConfig.referenceId = uuid();

    {
      let record = await brEdvStorage.edvs.insert({config: edvConfig});
      should.exist(record);
      record.config.should.eql(edvConfig);
      record = await database.collections['edv-storage-config'].findOne({
        'config.id': edvConfig.id
      });
      record.config.should.eql(edvConfig);
      record = await database.collections['edv-storage-referenceId'].findOne({
        controller: edvConfig.controller,
        referenceId: edvConfig.referenceId,
        configId: edvConfig.id
      });
      should.exist(record);
    }

    // manually mark config as pending to simulate incomplete insert (insert
    // that failed to complete or is concurrently in progress; both are the
    // same case)
    const result = await database.collections['edv-storage-config'].updateOne(
      {'config.id': edvConfig.id},
      {$set: {'meta.state': 'pending'}});
    result.result.n.should.equal(1);

    // try to get EDV config
    {
      let err = null;
      try {
        await brEdvStorage.edvs.get({id: edvConfig.id});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      err.name.should.equal('NotFoundError');
    }

    // should now overwrite pending record that never finished
    {
      edvConfig.id = await helpers.generateRandom();
      let record = await brEdvStorage.edvs.insert({config: edvConfig});
      should.exist(record);
      record.config.should.eql(edvConfig);
      record = await database.collections['edv-storage-config'].findOne({
        'config.id': edvConfig.id
      });
      record.config.should.eql(edvConfig);
      record = await database.collections['edv-storage-referenceId'].findOne({
        controller: edvConfig.controller,
        referenceId: edvConfig.referenceId,
        configId: edvConfig.id
      });
      should.exist(record);
    }

    // now inserting should produce a duplicate error
    {
      edvConfig.id = await helpers.generateRandom();
      let err = null;
      try {
        await brEdvStorage.edvs.insert({config: edvConfig});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      err.name.should.equal('DuplicateError');
    }
  });
}); // end `edvs.insert API`
