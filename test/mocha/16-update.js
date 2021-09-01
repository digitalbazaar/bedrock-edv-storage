/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');
const brEdvStorage = require('bedrock-edv-storage');
const database = require('bedrock-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');

const mockEdvId = `${config.server.baseUri}/edvs/z19xXoFRcobgskDQ6ywrRaa16`;
const hashedMockEdvId = database.hash(mockEdvId);

describe('docs.update API', () => {
  before(async () => {
    await helpers.prepareDatabase();
  });
  before(async () => {
    const edvConfig = {...mockData.config};
    edvConfig.id = mockEdvId;
    await brEdvStorage.edvs.insert({config: edvConfig});
  });
  it('should upsert a document', async () => {
    await brEdvStorage.docs.update({edvId: mockEdvId, doc: mockData.doc2});
    const record = await database.collections.edvDoc.findOne({
      edvId: hashedMockEdvId,
      'doc.id': mockData.doc2.id
    });
    should.exist(record);
    record.doc.should.eql(mockData.doc2);
  });
  it('should update a document', async () => {
    const doc = {...mockData.doc1, sequence: 1};
    await brEdvStorage.docs.update({edvId: mockEdvId, doc});
    const record = await database.collections.edvDoc.findOne({
      edvId: hashedMockEdvId,
      'doc.id': mockData.doc1.id
    });
    record.doc.should.eql(doc);
  });
  it('should fail to update a document with max safe sequence', async () => {
    let error;
    const doc = {...mockData.doc1, sequence: Number.MAX_SAFE_INTEGER};
    try {
      await brEdvStorage.docs.update({edvId: mockEdvId, doc});
      await database.collections.edvDoc.findOne({
        edvId: hashedMockEdvId,
        'doc.id': mockData.doc1.id
      });
    } catch(e) {
      error = e;
    }
    should.exist(error);
    error.name.should.equal('TypeError');
    error.message.should.equal(
      '"doc.sequence" number is too large.');
  });
  // FIXME: the current implementation does not check edv id
  // see: https://github.com/digitalbazaar/bedrock-edv-storage/issues/12
  it.skip('should fail for another EDV', async () => {
    let err;
    let record;
    try {
      record = await brEdvStorage.docs.update({
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
}); // end `docs.update`
