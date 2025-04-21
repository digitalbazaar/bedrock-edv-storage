/*!
 * Copyright (c) 2018-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as brEdvStorage from '@bedrock/edv-storage';
import * as helpers from './helpers.js';
import {config} from '@bedrock/core';
import {mockData} from './mock.data.js';

const mockEdvId = `${config.server.baseUri}/edvs/z19xXoFRcobgskDQ6ywrRaa13`;
const {localId: localMockEdvId} = helpers.parseLocalId({id: mockEdvId});

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
    documents[0].localEdvId.should.deep.equal(localMockEdvId);
    documents[0].doc.should.eql(doc);
  });
  it('should get a document by attribute and value w/version 0', async () => {
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
    documents[0].localEdvId.should.deep.equal(localMockEdvId);
    documents[0].doc.should.eql(mockData.docWithAttributes);
  });
  it('should get a document by attribute and value when multiple ' +
    'values exist for the attribute via an array w/version 0', async () => {
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
    documents[0].localEdvId.should.deep.equal(localMockEdvId);
    documents[0].doc.should.eql(mockData.docWithAttributes);
  });
  it('should get a document by attribute and value w/version 1', async () => {
    const records = await brEdvStorage.docs.find({
      edvId: mockEdvId,
      query: {
        $or: [{
          attributes: {
            $all: [mockData.docWithAttributesAttributes[0]]
          }
        }]
      }
    });
    should.exist(records);
    const {documents} = records;
    documents.should.be.an('array');
    documents.should.have.length(1);
    documents[0].should.be.an('object');
    documents[0].localEdvId.should.deep.equal(localMockEdvId);
    documents[0].doc.should.eql(mockData.docWithAttributes);
  });
  it('should get a document by attribute and value when multiple ' +
    'values exist for the attribute via an array w/version 1', async () => {
    const records = await brEdvStorage.docs.find({
      edvId: mockEdvId,
      query: {
        $or: [{
          attributes: {
            $all: [mockData.docWithAttributesAttributes[1]]
          }
        }]
      }
    });
    should.exist(records);
    const {documents} = records;
    documents.should.be.an('array');
    documents.should.have.length(1);
    documents[0].should.be.an('object');
    documents[0].localEdvId.should.deep.equal(localMockEdvId);
    documents[0].doc.should.eql(mockData.docWithAttributes);
  });
  it('should find no results w/version 0', async () => {
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
  it('should find no results w/version 1', async () => {
    const records = await brEdvStorage.docs.find({
      edvId: mockEdvId,
      query: {
        $or: [{
          attributes: {
            $all: ['does:not:exist']
          }
        }]
      }
    });
    should.exist(records);
    const {documents} = records;
    documents.should.be.an('array');
    documents.should.have.length(0);
  });
}); // end `docs.find`
