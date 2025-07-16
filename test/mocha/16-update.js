/*!
 * Copyright (c) 2018-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as brEdvStorage from '@bedrock/edv-storage';
import * as database from '@bedrock/mongodb';
import * as helpers from './helpers.js';
import {config} from '@bedrock/core';
import {mockData} from './mock.data.js';

const mockEdvId = `${config.server.baseUri}/edvs/z19xXoFRcobgskDQ6ywrRaa16`;
const {localId: localMockEdvId} = helpers.parseLocalId({id: mockEdvId});

describe('docs.update API', () => {
  let collection;
  before(async () => {
    await helpers.prepareDatabase();
    collection = database.collections['edv-storage-doc'];
  });
  before(async () => {
    const edvConfig = {...mockData.config};
    edvConfig.id = mockEdvId;
    await brEdvStorage.edvs.insert({config: edvConfig});
  });
  it('should upsert a document', async () => {
    await brEdvStorage.docs.update({edvId: mockEdvId, doc: mockData.doc2});
    const record = await collection.findOne({
      localEdvId: localMockEdvId,
      'doc.id': mockData.doc2.id
    });
    should.exist(record);
    record.doc.should.eql(mockData.doc2);
  });
  it('should update a document', async () => {
    const doc = {...mockData.doc1, sequence: 1};
    await brEdvStorage.docs.update({edvId: mockEdvId, doc});
    const record = await collection.findOne({
      localEdvId: localMockEdvId,
      'doc.id': mockData.doc1.id
    });
    record.doc.should.eql(doc);
  });
  it('should update a document and remove its attributes', async () => {
    // add doc
    await brEdvStorage.docs.update({
      edvId: mockEdvId, doc: mockData.docWithUniqueAttributes
    });

    // ensure attributes exist
    {
      const record = await collection.findOne({
        localEdvId: localMockEdvId,
        'doc.id': mockData.docWithUniqueAttributes.id
      });
      record.doc.sequence.should.equal(0);
      should.exist(record.attributes);
      should.exist(record.uniqueAttributes);
    }

    // update doc to remove attributes
    const doc = {...mockData.docWithUniqueAttributes, sequence: 1};
    doc.indexed = structuredClone(doc.indexed);
    doc.indexed[0].attributes = [];
    await brEdvStorage.docs.update({edvId: mockEdvId, doc});

    // ensure attributes have been cleared
    {
      const record = await collection.findOne({
        localEdvId: localMockEdvId,
        'doc.id': mockData.docWithUniqueAttributes.id
      });
      record.doc.sequence.should.equal(1);
      should.not.exist(record.attributes);
      should.not.exist(record.uniqueAttributes);
    }
  });
  it('should fail to update a document with max safe sequence', async () => {
    let error;
    const doc = {...mockData.doc1, sequence: Number.MAX_SAFE_INTEGER};
    try {
      await brEdvStorage.docs.update({edvId: mockEdvId, doc});
      await collection.findOne({
        localEdvId: localMockEdvId,
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
