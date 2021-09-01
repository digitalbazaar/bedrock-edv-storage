/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');
const brEdvStorage = require('bedrock-edv-storage');
const database = require('bedrock-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');

const mockEdvId = `${config.server.baseUri}/edvs/z19xXoFRcobgskDQ6ywrRaa12`;
const hashedMockEdvId = database.hash(mockEdvId);

describe('docs.insert API', () => {
  before(async () => {
    await helpers.prepareDatabase();
  });
  before(async () => {
    const edvConfig = {...mockData.config};
    edvConfig.id = mockEdvId;
    await brEdvStorage.edvs.insert({config: edvConfig});
  });
  it('should insert a document', async () => {
    const {doc1: doc} = mockData;
    const hashedDocId = database.hash(doc.id);
    let record = await brEdvStorage.docs.insert({
      edvId: mockEdvId,
      doc,
    });
    should.exist(record);
    record.edvId.should.equal(hashedMockEdvId);
    record.id.should.equal(hashedDocId);
    record.doc.should.eql(doc);
    record = await database.collections.edvDoc.findOne({
      edvId: hashedMockEdvId,
      id: hashedDocId
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
      const hashedDocId = database.hash(doc.id);
      let record = await brEdvStorage.docs.insert({
        edvId: mockEdvId,
        doc,
      });
      should.exist(record);
      record.edvId.should.equal(hashedMockEdvId);
      record.id.should.equal(hashedDocId);
      record.doc.should.eql(doc);
      record = await database.collections.edvDoc.findOne({
        edvId: hashedMockEdvId,
        id: hashedDocId
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
    const hashedDocId = database.hash(doc.id);
    let record = await brEdvStorage.docs.insert({
      edvId: mockEdvId,
      doc,
    });
    should.exist(record);
    record.edvId.should.equal(hashedMockEdvId);
    record.id.should.equal(hashedDocId);
    record.doc.should.eql(doc);
    record = await database.collections.edvDoc.findOne({
      edvId: hashedMockEdvId,
      id: hashedDocId
    });
    record.doc.should.eql(doc);
  });
  it('should insert a document with a unique attribute', async () => {
    const {docWithUniqueAttributes: doc} = mockData;
    const hashedDocId = database.hash(doc.id);
    let record = await brEdvStorage.docs.insert({
      edvId: mockEdvId,
      doc
    });
    should.exist(record);
    record.edvId.should.equal(hashedMockEdvId);
    record.id.should.equal(hashedDocId);
    record.doc.should.eql(doc);
    record = await database.collections.edvDoc.findOne({
      edvId: hashedMockEdvId,
      id: hashedDocId
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
    const hashedDocId = database.hash(doc.id);
    let record = await brEdvStorage.docs.insert({
      edvId: mockEdvId,
      doc,
    });
    should.exist(record);
    record.edvId.should.equal(hashedMockEdvId);
    record.id.should.equal(hashedDocId);
    record.doc.should.eql(mockData.docWithUniqueAttributes2);
    record = await database.collections.edvDoc.findOne({
      edvId: hashedMockEdvId,
      id: hashedDocId
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
  // FIXME: enable this test, current implementation does not test edv id
  // see: https://github.com/digitalbazaar/bedrock-edv-storage/issues/12
  it.skip('should fail for an unknown EDV ID', async () => {
    let err;
    let record;
    try {
      record = await brEdvStorage.docs.insert({
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
}); // end `docs.insert`
