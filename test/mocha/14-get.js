/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as brEdvStorage from '@bedrock/edv-storage';
import * as helpers from './helpers.js';
import {config} from '@bedrock/core';
import {mockData} from './mock.data.js';

const mockEdvId = `${config.server.baseUri}/edvs/z19xXoFRcobgskDQ6ywrRaa14`;

describe('docs.get API', () => {
  before(async () => {
    await helpers.prepareDatabase();
  });
  before(async () => {
    const edvConfig = {...mockData.config};
    edvConfig.id = mockEdvId;
    await brEdvStorage.edvs.insert({config: edvConfig});
    const {doc1: doc} = mockData;
    await brEdvStorage.docs.insert({
      edvId: mockEdvId,
      doc,
    });
  });
  it('should get a document', async () => {
    const record = await brEdvStorage.docs.get({
      edvId: mockEdvId,
      id: mockData.doc1.id
    });
    should.exist(record);
    record.doc.should.eql({...mockData.doc1});
  });
  // FIXME: current implementation does not check evd id
  // see: https://github.com/digitalbazaar/bedrock-edv-storage/issues/12
  it.skip('should fail for another EDV', async () => {
    let err;
    let record;
    try {
      record = await brEdvStorage.docs.get({
        edvId: 'urn:uuid:something-else',
        id: mockData.doc1.id
      });
    } catch(e) {
      err = e;
    }
    should.exist(err);
    should.not.exist(record);
    err.name.should.equal('PermissionDenied');
  });
  it('should get not found error', async () => {
    let err;
    let record;
    try {
      record = await brEdvStorage.docs.get({
        edvId: mockEdvId,
        // there is no document with this id
        id: 'z19pjdSMQMkBqqJ5zsaagncfX'
      });
    } catch(e) {
      err = e;
    }
    should.exist(err);
    should.not.exist(record);
    err.name.should.equal('NotFoundError');
  });
}); // end `docs.get`
