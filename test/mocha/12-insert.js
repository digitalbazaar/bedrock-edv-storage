/*!
 * Copyright (c) 2018-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as brEdvStorage from '@bedrock/edv-storage';
import * as database from '@bedrock/mongodb';
import * as helpers from './helpers.js';
import {config} from '@bedrock/core';
import {mockData} from './mock.data.js';

// import to test helper
import {
  _handleDocumentCompatibility
} from '@bedrock/edv-storage/lib/storage/docs.js';

const mockEdvId = `${config.server.baseUri}/edvs/z19xXoFRcobgskDQ6ywrRaa12`;
const {localId: localMockEdvId} = helpers.parseLocalId({id: mockEdvId});

describe('docs.insert API', () => {
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
  it('should insert a document', async () => {
    const {doc1: doc} = mockData;
    let record = await brEdvStorage.docs.insert({
      edvId: mockEdvId,
      doc,
    });
    should.exist(record);
    record.localEdvId.should.deep.equal(localMockEdvId);
    record.doc.should.eql(doc);
    record = await collection.findOne({
      localEdvId: localMockEdvId,
      'doc.id': doc.id
    });
    record.doc.should.eql(doc);
  });

  // test various sequence numbers
  for(const test of helpers.sequenceNumberTests) {
    it(test.title, async () => {
      const {doc1} = mockData;
      const doc = {...doc1};
      doc.id = await helpers.generateRandom();
      doc.sequence = test.sequence;
      let record = await brEdvStorage.docs.insert({
        edvId: mockEdvId,
        doc,
      });
      should.exist(record);
      record.localEdvId.should.deep.equal(localMockEdvId);
      record.doc.should.eql(doc);
      record = await collection.findOne({
        localEdvId: localMockEdvId,
        'doc.id': doc.id
      });
      record.doc.should.eql(doc);
    });
  }
  it('should fail to insert a document with a negative sequence number',
    async () => {
      let record;
      let error = null;
      try {
        const {doc1} = mockData;
        const doc = {...doc1};
        doc.id = await helpers.generateRandom();
        doc.sequence = -1;
        record = await brEdvStorage.docs.insert({
          edvId: mockEdvId,
          doc,
        });
      } catch(e) {
        error = e;
      }
      should.not.exist(record);
      should.exist(error);
      error.name.should.equal('TypeError');
      error.message.should.equal(
        '"doc.sequence" must be a non-negative integer.');
    });
  it('should fail to insert a document with max safe sequence number',
    async () => {
      let record;
      let error = null;
      try {
        const {doc1} = mockData;
        const doc = {...doc1};
        doc.id = await helpers.generateRandom();
        doc.sequence = Number.MAX_SAFE_INTEGER;
        record = await brEdvStorage.docs.insert({
          edvId: mockEdvId,
          doc,
        });
      } catch(e) {
        error = e;
      }
      should.not.exist(record);
      should.exist(error);
      error.name.should.equal('TypeError');
      error.message.should.equal(
        '"doc.sequence" number is too large.');
    });
  it('should insert a document with an attribute', async () => {
    const {docWithAttributes: doc} = mockData;
    let record = await brEdvStorage.docs.insert({
      edvId: mockEdvId,
      doc,
    });
    should.exist(record);
    record.localEdvId.should.deep.equal(localMockEdvId);
    record.doc.should.eql(doc);
    record = await collection.findOne({
      localEdvId: localMockEdvId,
      'doc.id': doc.id
    });
    record.doc.should.eql(doc);
  });
  it('should insert a document with a unique attribute', async () => {
    const {docWithUniqueAttributes: doc} = mockData;
    let record = await brEdvStorage.docs.insert({
      edvId: mockEdvId,
      doc
    });
    should.exist(record);
    record.localEdvId.should.deep.equal(localMockEdvId);
    record.doc.should.eql(doc);
    record = await collection.findOne({
      localEdvId: localMockEdvId,
      'doc.id': doc.id
    });
    record.doc.should.eql(doc);
  });
  it('should detect a duplicate with a unique attribute', async () => {
    const doc = {...mockData.docWithUniqueAttributes};
    doc.id = 'z19pjdSMQMkBqqJ5zsbbgeeee';
    let err;
    try {
      await brEdvStorage.docs.insert({
        edvId: mockEdvId,
        doc
      });
    } catch(e) {
      err = e;
    }
    should.exist(err);
    err.name.should.equal('DuplicateError');
  });
  it('should detect an upsert duplicate', async () => {
    const doc = {...mockData.docWithUniqueAttributes};
    doc.id = 'z19pjdSMQMkBqqJ5zsbbgffff';
    let err;
    try {
      await brEdvStorage.docs.update({
        edvId: mockEdvId,
        doc
      });
    } catch(e) {
      err = e;
    }
    should.exist(err);
    err.name.should.equal('DuplicateError');
  });
  it('should insert a document with non-conflicting attribute', async () => {
    const {docWithUniqueAttributes2: doc} = mockData;
    let record = await brEdvStorage.docs.insert({
      edvId: mockEdvId,
      doc,
    });
    should.exist(record);
    record.localEdvId.should.deep.equal(localMockEdvId);
    record.doc.should.eql(mockData.docWithUniqueAttributes2);
    record = await collection.findOne({
      localEdvId: localMockEdvId,
      'doc.id': doc.id
    });
    record.doc.should.eql(doc);
  });
  it('should return error on duplicate document', async () => {
    const {doc1: doc} = mockData;
    // attempt to insert the same document again
    let err;
    try {
      await brEdvStorage.docs.insert({
        edvId: mockEdvId,
        doc
      });
    } catch(e) {
      err = e;
    }
    should.exist(err);
    err.name.should.equal('DuplicateError');
  });

  it('should handle migration from doc version 0 to version 1', async () => {
    await helpers.prepareDatabase();

    // insert version `0` doc record
    const {docWithAttributes: doc} = mockData;
    const record = {
      localEdvId: localMockEdvId,
      meta: {created: 1745195062490, updated: 1745195062490},
      doc
    };
    await collection.insertOne(record);

    // get record
    const record2 = await collection.findOne({
      localEdvId: localMockEdvId,
      'doc.id': doc.id
    });

    // it should not have attributes
    should.not.exist(record2.attributes);

    // force migration to version `1`
    await _handleDocumentCompatibility({
      checkIndexPromise: Promise.resolve(true),
      background: false
    });

    // fetch record
    const record3 = await collection.findOne({
      localEdvId: localMockEdvId,
      'doc.id': doc.id
    });

    const expectedAttributes = mockData.docWithAttributesAttributes;
    // sequence should be the same (`0`)
    record3.doc.sequence.should.equal(0);
    // version should be set
    should.exist(record3.version);
    record3.version.should.equal(1);
    // attributes should now be set
    should.exist(record3.attributes);
    record3.attributes.should.deep.equal(expectedAttributes);
  });
}); // end `docs.insert`
