/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');
const brEdvStorage = require('bedrock-edv-storage');
const database = require('bedrock-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');
const {Cipher} = require('minimal-cipher');
const axios = require('axios');
const brHttpsAgent = require('bedrock-https-agent');

let actors;
let accounts;

const chunkSize = 1048576;
const cipher = new Cipher();
const {keyResolver} = helpers;

const mockEdvId = `${config.server.baseUri}/edvs/z19xXoFRcobgskDQ6ywrRaa17`;
const hashedMockEdvId = database.hash(mockEdvId);

describe('chunk API', () => {
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
  it('should insert a new chunk', async () => {
    const {doc1: doc} = mockData;
    const hashedDocId = database.hash(doc.id);
    const docInsertResult = await brEdvStorage.insert({
      edvId: mockEdvId,
      doc,
    });
    should.exist(docInsertResult);
    docInsertResult.edvId.should.equal(hashedMockEdvId);
    docInsertResult.id.should.equal(hashedDocId);
    docInsertResult.doc.should.eql(doc);
    const encryptStream = await cipher.createEncryptStream(
      {recipients, keyResolver, chunkSize});

  });
});

