/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as brEdvStorage from '@bedrock/edv-storage';
import * as helpers from './helpers.js';
import {config} from '@bedrock/core';
import {mockData} from './mock.data.js';

const mockEdvId = `${config.server.baseUri}/edvs/z19xXoFRcobgskDQ6ywrRaa13`;

describe('docs.count API', () => {
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
  it('should get a document count by attribute', async () => {
    const entry = mockData.docWithAttributes.indexed[0];
    const [attribute] = entry.attributes;
    const count = await brEdvStorage.docs.count({
      edvId: mockEdvId,
      query: {
        'doc.indexed.hmac.id': entry.hmac.id,
        'doc.indexed.attributes.name': {
          $all: [attribute.name]
        }
      }
    });
    should.exist(count);
    count.should.be.a('number');
    count.should.equal(1);
  });
  it('should get a document count by attribute and value', async () => {
    const entry = mockData.docWithAttributes.indexed[0];
    const [attribute] = entry.attributes;
    const count = await brEdvStorage.docs.count({
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
    should.exist(count);
    count.should.be.a('number');
    count.should.equal(1);
  });
  it('should get a document count by attribute and value when multiple ' +
    'values exist for the attribute via an array', async () => {
    const entry = mockData.docWithAttributes.indexed[0];
    const [, attribute] = entry.attributes;
    const count = await brEdvStorage.docs.count({
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
    should.exist(count);
    count.should.be.a('number');
    count.should.equal(1);
  });
  it('should count no results', async () => {
    const entry = mockData.docWithAttributes.indexed[0];
    const count = await brEdvStorage.docs.count({
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
    should.exist(count);
    count.should.be.a('number');
    count.should.equal(0);
  });
  // FIXME: the current implementation does not check for a valid edv id
  // see: https://github.com/digitalbazaar/bedrock-edv-storage/issues/12
  it.skip('should fail for another EDV', async () => {
    const entry = mockData.docWithAttributes.indexed[0];
    let err;
    let count;
    try {
      count = await brEdvStorage.docs.count({
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
    should.not.exist(count);
    err.name.should.equal('PermissionDenied');
  });
}); // end `docs.count`
