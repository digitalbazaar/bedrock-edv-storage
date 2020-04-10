/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');
const brEdvStorage = require('bedrock-edv-storage');
const database = require('bedrock-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');
let actors;
let accounts;

const mockEdvId = `${config.server.baseUri}/edvs/z19xXoFRcobgskDQ6ywrRaa13`;
const hashedMockEdvId = database.hash(mockEdvId);

describe('find API', () => {
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
    const {docWithAttributes: doc} = mockData;
    await brEdvStorage.insert({
      actor,
      edvId: mockEdvId,
      doc,
    });
  });
  it('should get a document by attribute', async () => {
    const actor = actors['alpha@example.com'];
    const {docWithAttributes: doc} = mockData;
    const entry = mockData.docWithAttributes.indexed[0];
    const [attribute] = entry.attributes;
    const records = await brEdvStorage.find({
      actor,
      edvId: mockEdvId,
      query: {
        'doc.indexed.hmac.id': entry.hmac.id,
        'doc.indexed.attributes.name': {
          $all: [attribute.name]
        }
      }
    });
    should.exist(records);
    records.should.have.length(1);
    const [record] = records;
    record.edvId.should.equal(hashedMockEdvId);
    record.doc.should.eql(doc);
  });
  it('should get a document by attribute and value', async () => {
    const actor = actors['alpha@example.com'];
    const entry = mockData.docWithAttributes.indexed[0];
    const [attribute] = entry.attributes;
    const records = await brEdvStorage.find({
      actor,
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
    records.should.have.length(1);
    const [record] = records;
    record.edvId.should.equal(hashedMockEdvId);
    record.doc.should.eql(mockData.docWithAttributes);
  });
  it('should get a document by attribute and value when multiple ' +
    'values exist for the attribute via an array', async () => {
    const actor = actors['alpha@example.com'];
    const entry = mockData.docWithAttributes.indexed[0];
    const [, attribute] = entry.attributes;
    const records = await brEdvStorage.find({
      actor,
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
    records.should.have.length(1);
    const [record] = records;
    record.edvId.should.equal(hashedMockEdvId);
    record.doc.should.eql(mockData.docWithAttributes);
  });
  it('should find no results', async () => {
    const actor = actors['alpha@example.com'];
    const entry = mockData.docWithAttributes.indexed[0];
    const records = await brEdvStorage.find({
      actor,
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
    records.should.have.length(0);
  });
  // FIXME: the current implementation does not check for a valid edv id
  // see: https://github.com/digitalbazaar/bedrock-edv-storage/issues/12
  it.skip('should fail for another EDV', async () => {
    const actor = actors['alpha@example.com'];
    const entry = mockData.docWithAttributes.indexed[0];
    let err;
    let records;
    try {
      records = await brEdvStorage.find({
        actor,
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
}); // end `find`
