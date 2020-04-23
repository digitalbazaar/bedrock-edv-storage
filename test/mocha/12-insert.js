/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');
const brEdvStorage = require('bedrock-edv-storage');
const database = require('bedrock-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');

const mockEdvId = `${config.server.baseUri}/edvs/z19xXoFRcobgskDQ6ywrRaa12`;
const hashedMockEdvId = database.hash(mockEdvId);

describe('insert API', () => {
  let actors;
  let accounts;
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
  });
  it('should insert a document', async () => {
    const actor = actors['alpha@example.com'];
    const {doc1: doc} = mockData;
    const hashedDocId = database.hash(doc.id);
    let record = await brEdvStorage.insert({
      actor,
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
  for(const test of helpers.sequenceNumberTests({})) {
    it(test.title, async () => {
      const actor = actors['alpha@example.com'];
      const {doc1} = mockData;
      const doc = {...doc1};
      doc.id = await helpers.generateRandom();
      doc.sequence = test.sequence;
      const hashedDocId = database.hash(doc.id);
      let record = await brEdvStorage.insert({
        actor,
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
      let record, error = null;
      try {
        const actor = actors['alpha@example.com'];
        const {doc1} = mockData;
        const doc = {...doc1};
        doc.id = await helpers.generateRandom();
        doc.sequence = -1;
        record = await brEdvStorage.insert({
          actor,
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

  it('should fail to insert a document with' +
    'a sequence number greater than MAX_SAFE_INTEGER',
  async () => {
    let record, error = null;
    try {
      const actor = actors['alpha@example.com'];
      const {doc1} = mockData;
      const doc = {...doc1};
      doc.id = await helpers.generateRandom();
      doc.sequence = Number.MAX_SAFE_INTEGER + 1;
      record = await brEdvStorage.insert({
        actor,
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
      '"doc.sequence" must be less than MAX_SAFE_INTEGER');
  });
  it('should insert a document with an attribute', async () => {
    const actor = actors['alpha@example.com'];
    const {docWithAttributes: doc} = mockData;
    const hashedDocId = database.hash(doc.id);
    let record = await brEdvStorage.insert({
      actor,
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
    const actor = actors['alpha@example.com'];
    const {docWithUniqueAttributes: doc} = mockData;
    const hashedDocId = database.hash(doc.id);
    let record = await brEdvStorage.insert({
      actor,
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
    const actor = actors['alpha@example.com'];
    const doc = {...mockData.docWithUniqueAttributes};
    doc.id = 'z19pjdSMQMkBqqJ5zsbbgeeee';
    let err;
    try {
      await brEdvStorage.insert({
        actor,
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
    const actor = actors['alpha@example.com'];
    const doc = {...mockData.docWithUniqueAttributes};
    doc.id = 'z19pjdSMQMkBqqJ5zsbbgffff';
    let err;
    try {
      await brEdvStorage.update({
        actor,
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
    const actor = actors['alpha@example.com'];
    const {docWithUniqueAttributes2: doc} = mockData;
    const hashedDocId = database.hash(doc.id);
    let record = await brEdvStorage.insert({
      actor,
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
    const actor = actors['alpha@example.com'];
    const {doc1: doc} = mockData;
    // attempt to insert the same document again
    let err;
    try {
      await brEdvStorage.insert({
        actor,
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
    const actor = actors['alpha@example.com'];
    let err;
    let record;
    try {
      record = await brEdvStorage.insert({
        actor,
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
}); // end `insert`
