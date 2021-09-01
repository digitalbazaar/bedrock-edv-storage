/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');
const brEdvStorage = require('bedrock-edv-storage');
const database = require('bedrock-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');

const mockEdvId = `${config.server.baseUri}/edvs/z19xXoFRcobgskDQ6ywrRaa13`;
const hashedMockEdvId = database.hash(mockEdvId);

describe('docs.find API', () => {
  before(async () => {
    await helpers.prepareDatabase();
  });
  before(async () => {
    const edvConfig = {...mockData.config};
    edvConfig.id = mockEdvId;
    await brEdvStorage.edvs.insert({config: edvConfig});
    const {docWithAttributes: doc} = mockData;
    await brEdvStorage.docs.insert({
      edvId: mockEdvId,
      doc,
    });
  });
  it('should get a document by attribute', async () => {
    const {docWithAttributes: doc} = mockData;
    const entry = mockData.docWithAttributes.indexed[0];
    const [attribute] = entry.attributes;
    const records = await brEdvStorage.docs.find({
      edvId: mockEdvId,
      query: {
        'doc.indexed.hmac.id': entry.hmac.id,
        'doc.indexed.attributes.name': {
          $all: [attribute.name]
        }
      }
    });
    should.exist(records);
    const {documents} = records;
    documents.should.be.an('array');
    documents.should.have.length(1);
    documents[0].should.be.an('object');
    documents[0].edvId.should.equal(hashedMockEdvId);
    documents[0].doc.should.eql(doc);
  });
  it('should get a document by attribute and value', async () => {
    const entry = mockData.docWithAttributes.indexed[0];
    const [attribute] = entry.attributes;
    const records = await brEdvStorage.docs.find({
      edvId: mockEdvId,
      query: {
        $or: [{
          'doc.indexed.hmac.id': entry.hmac.id,
          'doc.indexed.attributes': {
            $elemMatch: attribute
          }
        }]
      }
    });
    should.exist(records);
    const {documents} = records;
    documents.should.be.an('array');
    documents.should.have.length(1);
    documents[0].should.be.an('object');
    documents[0].edvId.should.equal(hashedMockEdvId);
    documents[0].doc.should.eql(mockData.docWithAttributes);
  });
  it('should get a document by attribute and value when multiple ' +
    'values exist for the attribute via an array', async () => {
    const entry = mockData.docWithAttributes.indexed[0];
    const [, attribute] = entry.attributes;
    const records = await brEdvStorage.docs.find({
      edvId: mockEdvId,
      query: {
        $or: [{
          'doc.indexed.hmac.id': entry.hmac.id,
          'doc.indexed.attributes': {
            $elemMatch: attribute
          }
        }]
      }
    });
    should.exist(records);
    const {documents} = records;
    documents.should.be.an('array');
    documents.should.have.length(1);
    documents[0].should.be.an('object');
    documents[0].edvId.should.equal(hashedMockEdvId);
    documents[0].doc.should.eql(mockData.docWithAttributes);
  });
  it('should find no results', async () => {
    const entry = mockData.docWithAttributes.indexed[0];
    const records = await brEdvStorage.docs.find({
      edvId: mockEdvId,
      query: {
        $or: [{
          'doc.indexed.hmac.id': entry.hmac.id,
          'doc.indexed.attributes': {
            $elemMatch: {
              name: 'foo',
              value: 'does-not-exist'
            }
          }
        }]
      }
    });
    should.exist(records);
    const {documents} = records;
    documents.should.be.an('array');
    documents.should.have.length(0);
  });
  // FIXME: the current implementation does not check for a valid edv id
  // see: https://github.com/digitalbazaar/bedrock-edv-storage/issues/12
  it.skip('should fail for another EDV', async () => {
    const entry = mockData.docWithAttributes.indexed[0];
    let err;
    let records;
    try {
      records = await brEdvStorage.docs.find({
        edvId: 'urn:uuid:something-else',
        query: {
          'doc.indexed.hmac.id': entry.hmac.id,
          'doc.indexed.attributes': {
            $all: [{$elemMatch: {name: 'foo', value: 'does-not-exist'}}]
          }
        }
      });
    } catch(e) {
      err = e;
    }
    should.exist(err);
    should.not.exist(records);
    err.name.should.equal('PermissionDenied');
  });
}); // end `docs.find`
