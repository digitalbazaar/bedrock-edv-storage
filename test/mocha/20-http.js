/*!
 * Copyright (c) 2018-2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

require('bedrock-edv-storage');
const https = require('https');
// allow self-signed cert for tests
const axios = require('axios').create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false
  })
});
const {config} = require('bedrock');
const helpers = require('./helpers');
const mockData = require('./mock.data');
let actors;
let accounts;
let urls;
let edvId;

// auto-pass authentication checks
const brPassport = require('bedrock-passport');
brPassport.authenticateAll = ({req}) => {
  const email = req.get('x-test-account');
  return {
    user: {
      actor: actors[email],
      account: accounts[email].account
    }
  };
};

describe('bedrock-edv-storage HTTP API', () => {
  before(async () => {
    await helpers.prepareDatabase(mockData);
    actors = await helpers.getActors(mockData);
    accounts = mockData.accounts;

    // common URLs
    const {baseUri} = config.server;
    const root = `${baseUri}/edvs`;
    const invalid = `${baseUri}/edvs/invalid`;
    urls = {
      edvs: root,
      invalidDocuments: `${invalid}/documents`,
      invalidQuery: `${invalid}/query`
    };
  });

  describe('insertConfig', () => {
    it('should create an EDV', async () => {
      const account = accounts['alpha@example.com'].account;
      const config = {
        ...mockData.config,
        controller: account.id,
        referenceId: 'primary'
      };
      delete config.id;
      const response = await axios.post(
        urls.edvs, config,
        {headers: {
          'x-test-account': 'alpha@example.com'
        }});
      response.status.should.equal(201);
      response.data.should.be.an('object');
      response.data.id.should.be.a('string');
      config.id = response.data.id;
      response.data.should.deep.equal(config);

      // TODO: rework test suite to avoid shared state
      // update state used in other tests
      edvId = config.id;
      urls.documents = `${edvId}/documents`;
      urls.query = `${edvId}/query`;
    });
    it('should fail for another account', async () => {
      let err;
      try {
        const config = {...mockData.config, controller: 'urn:other:account'};
        await axios.post(
          urls.edvs, config,
          {headers: {
            'x-test-account': 'alpha@example.com'
          }});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      should.exist(err.response);
      err.response.status.should.equal(403);
      err.response.data.type.should.equal('PermissionDenied');
    });
  }); // end `insertConfig`

  describe('insert', () => {
    it('should insert a document', async () => {
      const response = await axios.post(
        urls.documents, mockData.doc1,
        {headers: {'x-test-account': 'alpha@example.com'}});
      response.status.should.equal(201);
      response.headers.location.should.equal(
        urls.documents + '/' +
        encodeURIComponent(mockData.doc1.id));
    });
    it('should insert a document with attributes', async () => {
      const response = await axios.post(
        urls.documents, mockData.docWithAttributes,
        {headers: {'x-test-account': 'alpha@example.com'}});
      response.status.should.equal(201);
      response.headers.location.should.equal(
        urls.documents + '/' +
        encodeURIComponent(mockData.docWithAttributes.id));
    });
    it('should return error on duplicate document', async () => {
      let err;
      try {
        await axios.post(
          urls.documents, mockData.doc1,
          {headers: {'x-test-account': 'alpha@example.com'}});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      should.exist(err.response);
      err.response.status.should.equal(409);
      err.response.data.type.should.equal('DuplicateError');
    });
    it('should not insert for another EDV', async () => {
      let err;
      try {
        await axios.post(
          urls.invalidDocuments, mockData.doc1,
          {headers: {'x-test-account': 'alpha@example.com'}});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      should.exist(err.response);
      err.response.status.should.equal(403);
      err.response.data.type.should.equal('PermissionDenied');
    });
  }); // end `insert`

  describe('update', () => {
    it('should upsert a document', async () => {
      const url =
        urls.documents + '/' +
        encodeURIComponent(mockData.doc2.id);
      const response = await axios.post(
        url, mockData.doc2,
        {headers: {'x-test-account': 'alpha@example.com'}});
      response.status.should.equal(204);
    });
    it('should update a document', async () => {
      const url =
        urls.documents + '/' +
        encodeURIComponent(mockData.doc1.id);
      const doc = {...mockData.doc1, sequence: 1};
      const response = await axios.post(
        url, doc,
        {headers: {'x-test-account': 'alpha@example.com'}});
      response.status.should.equal(204);
    });
    it('should fail for another EDV', async () => {
      const url =
        urls.invalidDocuments + '/' +
        encodeURIComponent(mockData.doc1.id);
      let err;
      try {
        await axios.post(
          url, mockData.doc1,
          {headers: {'x-test-account': 'alpha@example.com'}});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      should.exist(err.response);
      err.response.status.should.equal(403);
      err.response.data.type.should.equal('PermissionDenied');
    });
  }); // end `update`

  describe('get', () => {
    it('should get a document', async () => {
      const url =
        urls.documents + '/' +
        encodeURIComponent(mockData.doc1.id);
      const response = await axios.get(
        url, {headers: {'x-test-account': 'alpha@example.com'}});
      response.status.should.equal(200);
      response.data.should.deep.equal({...mockData.doc1, sequence: 1});
    });
    it('should fail for another EDV', async () => {
      const url =
        urls.invalidDocuments + '/' +
        encodeURIComponent(mockData.doc1.id);
      let err;
      try {
        await axios.get(
          url, {headers: {'x-test-account': 'alpha@example.com'}});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      should.exist(err.response);
      err.response.status.should.equal(403);
      err.response.data.type.should.equal('PermissionDenied');
    });
    it('should get not found error', async () => {
      const url = urls.documents + '/does-not-exist';
      let err;
      try {
        await axios.get(
          url, {headers: {'x-test-account': 'alpha@example.com'}});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      should.exist(err.response);
      err.response.status.should.equal(404);
      err.response.data.type.should.equal('NotFoundError');
    });
  }); // end `get`

  describe('find', () => {
    it('should get a document by attribute', async () => {
      const entry = mockData.docWithAttributes.indexed[0];
      const [attribute] = entry.attributes;
      const query = {
        index: entry.hmac.id,
        has: [attribute.name]
      };
      const response = await axios.post(
        urls.query, query, {headers: {'x-test-account': 'alpha@example.com'}});
      response.status.should.equal(200);
      response.data.should.be.an('array');
      response.data.length.should.equal(1);
      response.data[0].should.deep.equal(mockData.docWithAttributes);
    });
    it('should get a document by attribute and value', async () => {
      const entry = mockData.docWithAttributes.indexed[0];
      const [attribute] = entry.attributes;
      const query = {
        index: entry.hmac.id,
        equals: [{[attribute.name]: attribute.value}]
      };
      const response = await axios.post(
        urls.query, query, {headers: {'x-test-account': 'alpha@example.com'}});
      response.status.should.equal(200);
      response.data.should.be.an('array');
      response.data.length.should.equal(1);
      response.data[0].should.deep.equal(mockData.docWithAttributes);
    });
    it('should find no results', async () => {
      const entry = mockData.docWithAttributes.indexed[0];
      const query = {
        index: entry.hmac.id,
        equals: [{foo: 'does-not-exist'}]
      };
      const response = await axios.post(
        urls.query, query, {headers: {'x-test-account': 'alpha@example.com'}});
      response.status.should.equal(200);
      response.data.should.be.an('array');
      response.data.length.should.equal(0);
    });
    it('should fail for another EDV', async () => {
      const entry = mockData.docWithAttributes.indexed[0];
      const query = {
        index: entry.hmac.id,
        equals: [{foo: 'does-not-exist'}]
      };
      let err;
      try {
        await axios.post(
          urls.invalidQuery, query,
          {headers: {'x-test-account': 'alpha@example.com'}});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      should.exist(err.response);
      err.response.status.should.equal(403);
      err.response.data.type.should.equal('PermissionDenied');
    });
  }); // end `find`

  describe('delete', () => {
    it('should delete a document', async () => {
      const url =
        urls.documents + '/' +
        encodeURIComponent(mockData.doc1.id);
      const response = await axios.delete(
        url, {headers: {'x-test-account': 'alpha@example.com'}});
      response.status.should.equal(204);
    });
    it('should return 404 for a missing document', async () => {
      const url =
        urls.documents + '/' +
        encodeURIComponent(mockData.doc1.id);
      let err;
      try {
        await axios.delete(
          url, {headers: {'x-test-account': 'alpha@example.com'}});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      should.exist(err.response);
      err.response.status.should.equal(404);
    });
    it('should fail for another EDV', async () => {
      const url =
        urls.invalidDocuments + '/' +
        encodeURIComponent(mockData.doc1.id);
      let err;
      try {
        await axios.delete(
          url, {headers: {'x-test-account': 'alpha@example.com'}});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      should.exist(err.response);
      err.response.status.should.equal(403);
      err.response.data.type.should.equal('PermissionDenied');
    });
  }); // end `delete`
}); // end bedrock-edv-storage
