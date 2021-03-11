/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {ReadableStream} = require('web-streams-polyfill/ponyfill');
const bedrock = require('bedrock');
const helpers = require('./helpers');
const mockData = require('./mock.data');
const {config} = bedrock;
const {CapabilityAgent} = require('webkms-client');
const {EdvDocument} = require('edv-client');
const brEdvStorage = require('bedrock-edv-storage');

let actors;
let urls;

describe('bedrock-edv-storage HTTP API - edv-client chunks', function() {
  let passportStub;
  let capabilityAgent;
  let edvClient;
  let invocationSigner;

  before(async () => {
    await helpers.prepareDatabase(mockData);
    actors = await helpers.getActors(mockData);
    passportStub = helpers.stubPassport({actor: actors['alpha@example.com']});
    // common URLs
    const {baseUri} = config.server;
    const root = `${baseUri}/edvs`;
    urls = {
      edvs: root,
    };
    const secret = '9c727b65-8553-4275-9ac3-0ac89396efc0';
    const handle = 'testKey3';
    capabilityAgent = await CapabilityAgent.fromSecret(
      {secret, handle});
    invocationSigner = capabilityAgent.getSigner();
    const keystoreAgent = await helpers.createKeystore({capabilityAgent});

    // corresponds to the passport authenticated user
    const actor = actors['alpha@example.com'];

    ({edvClient} = await helpers.createEdv(
      {actor, capabilityAgent, keystoreAgent, urls}));
  });

  after(() => {
    passportStub.restore();
  });

  it('should insert a document with a stream', async () => {
    const docId = 'z19krtYWG3TdMyicpnbeXWwT4';
    const doc = {id: docId, content: {someKey: 'someValue'}};
    const data = helpers.getRandomUint8();
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(data);
        controller.close();
      }
    });
    const inserted = await edvClient.insert(
      {invocationSigner, doc, stream});

    // Streams are added in an update
    // after the initial document has been written
    // hence the sequence is 1 and not 0.
    inserted.content.should.deep.equal({someKey: 'someValue'});
    should.exist(inserted.stream);
    inserted.stream.should.be.an('object');
  });

  it('should be able to decrypt a stream from an EdvDocument', async () => {
    edvClient.ensureIndex({attribute: 'content.indexedKey'});
    const docId = 'z1A6MUALPcgdjfNAWk63qqdVZ';
    const doc = {id: docId, content: {indexedKey: 'value1'}};
    const data = helpers.getRandomUint8();
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(data);
        controller.close();
      }
    });
    await edvClient.insert({doc, stream, invocationSigner});
    const edvDoc = new EdvDocument({
      invocationSigner,
      id: doc.id,
      keyAgreementKey: edvClient.keyAgreementKey,
      keyResolver: edvClient.keyResolver,
      client: edvClient,
    });
    const result = await edvDoc.read();
    result.should.be.an('object');
    result.content.should.eql({indexedKey: 'value1'});
    should.exist(result.stream);
    result.stream.should.be.an('object');
    const expectedStream = await edvDoc.getStream({doc: result});
    const reader = expectedStream.getReader();
    let streamData = new Uint8Array(0);
    let done = false;
    while(!done) {
      // value is either undefined or a Uint8Array
      const {value, done: _done} = await reader.read();
      // if there is a chunk then we need to update the streamData
      if(value) {
        // create a new array with the new length
        const next = new Uint8Array(streamData.length + value.length);
        // set the first values to the existing chunk
        next.set(streamData);
        // set the chunk's values to the rest of the array
        next.set(value, streamData.length);
        // update the streamData
        streamData = next;
      }
      done = _done;
    }
    // ensure decrypted data matches original data
    data.should.eql(streamData);
  });
  it('should be able to write a stream to an EdvDocument', async () => {
    edvClient.ensureIndex({attribute: 'content.indexedKey'});
    const docId = 'z1A2my1mru8g7kXxgzMcwbgWL';
    const doc = {id: docId, content: {indexedKey: 'value2'}};
    const insertResult = await edvClient.insert(
      {doc, invocationSigner});
    const edvDoc = new EdvDocument({
      invocationSigner,
      id: doc.id,
      keyAgreementKey: edvClient.keyAgreementKey,
      keyResolver: edvClient.keyResolver,
      client: edvClient,
    });
    const dataUpdate = helpers.getRandomUint8();
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(dataUpdate);
        controller.close();
      }
    });
    // NOTE: we have to use insertResult here
    // just using doc will result in duplicate key error
    const result = await edvClient.update(
      {doc: insertResult, stream, invocationSigner});
    result.should.be.an('object');
    result.content.should.deep.equal({indexedKey: 'value2'});
    should.exist(result.stream);
    const expectedStream = await edvDoc.getStream({doc: result});
    const reader = expectedStream.getReader();
    let streamData = new Uint8Array(0);
    let done = false;
    while(!done) {
      // value is either undefined or a Uint8Array
      const {value, done: _done} = await reader.read();
      // if there is a chunk then we need to update the streamData
      if(value) {
        // create a new array with the new length
        const next = new Uint8Array(streamData.length + value.length);
        // set the first values to the existing chunk
        next.set(streamData);
        // set the chunk's values to the rest of the array
        next.set(value, streamData.length);
        // update the streamData
        streamData = next;
      }
      done = _done;
    }
  });

  it('should throw error if document chunk does not exist', async () => {
    edvClient.ensureIndex({attribute: 'content.indexedKey'});
    const docId = 'z1A5griaxMEoVewt747yxiUec';
    const doc = {id: docId, content: {indexedKey: 'value3'}};
    const data = helpers.getRandomUint8();
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(data);
        controller.close();
      }
    });
    await edvClient.insert({doc, invocationSigner, stream});
    const edvDoc = new EdvDocument({
      invocationSigner,
      id: doc.id,
      keyAgreementKey: edvClient.keyAgreementKey,
      keyResolver: edvClient.keyResolver,
      client: edvClient
    });
    const result = await edvDoc.read();

    result.should.be.an('object');
    result.content.should.eql({indexedKey: 'value3'});
    should.exist(result.stream);
    result.stream.should.be.an('object');

    // intentionally clear the database of first chunk
    await brEdvStorage.removeChunk(
      {edvId: edvClient.id, docId: doc.id, chunkIndex: 0});
    let err;
    try {
      const expectedStream = await edvDoc.getStream({doc: result});
      const reader = expectedStream.getReader();
      // FIXME this is where it should be throwing
      const readResult = await reader.read();
      // FIXME delete this once working
      console.log({readResult});
    } catch(e) {
      err = e;
    }
    should.exist(err);
    err.name.should.equal('NotFoundError');
    err.message.should.equal('Document chunk not found.');
  });
});
