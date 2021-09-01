/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {asyncHandler} = require('bedrock-express');
const authz = require('./authz.js');
const bedrock = require('bedrock');
require('bedrock-express');
const {util: {BedrockError}} = bedrock;
const cors = require('cors');
const helpers = require('../helpers');
const chunks = require('../storage/chunks.js');
const {validate} = require('bedrock-validation');

bedrock.events.on('bedrock-express.configure.routes', app => {
  const routes = helpers.getRoutes();

  // authz for doc endpoints
  const authorizeDocZcapInvocation = authz.authorizeDocZcapInvocation();

  /* Note: CORS is used on all endpoints. This is safe because authorization
  uses HTTP signatures + capabilities, not cookies; CSRF is not possible. */

  // store a document chunk
  app.options(routes.chunk, cors());
  app.post(
    routes.chunk,
    // CORs is safe because authorization uses HTTP signatures + capabilities,
    // not cookies
    cors(),
    validate('bedrock-edv-storage.chunk'),
    authorizeDocZcapInvocation,
    asyncHandler(async (req, res) => {
      const {docId} = req.params;
      helpers.assert128BitId(docId);
      const edvId = helpers.getEdvId({localId: req.params.edvId});
      // TODO: add document ID to the chunk as well -- as a sanity check?
      /*if(req.body.document !== docId) {
        throw new BedrockError(
          'Could not update document chunk; ID does not match.',
          'DataError', {public: true, httpStatusCode: 400});
      }*/
      await chunks.update({edvId, docId, chunk: req.body});
      res.status(204).end();

      // meter operation usage
      helpers.reportOperationUsageWithoutWaiting({edvId});
    }));

  // get a document chunk
  app.get(
    routes.chunk,
    cors(),
    authorizeDocZcapInvocation,
    asyncHandler(async (req, res) => {
      // validate `chunkIndex`
      const {docId} = req.params;
      helpers.assert128BitId(docId);
      let {chunkIndex} = req.params;
      try {
        chunkIndex = parseInt(chunkIndex, 10);
      } catch(e) {
        // invalid chunk index, report not found
        throw new BedrockError(
          'Encrypted data vault document chunk not found.',
          'NotFoundError',
          {document: docId, chunkIndex, httpStatusCode: 404, public: true});
      }
      const edvId = helpers.getEdvId({localId: req.params.edvId});
      const {chunk} = await chunks.get({edvId, docId, chunkIndex});

      // TODO: need to determine how to filter the recipients to include
      // in the JWE (use specified recipient key in the JWE or invoker ID
      // somehow)

      res.json(chunk);

      // meter operation usage
      helpers.reportOperationUsageWithoutWaiting({edvId});
    }));

  // delete a document chunk
  app.delete(
    routes.chunk,
    // CORs is safe because authorization uses HTTP signatures + capabilities,
    // not cookies
    cors(),
    authorizeDocZcapInvocation,
    asyncHandler(async (req, res) => {
      const {docId, chunkIndex} = req.params;
      helpers.assert128BitId(docId);
      const edvId = helpers.getEdvId({localId: req.params.edvId});
      const removed = await chunks.remove({edvId, docId, chunkIndex});
      if(removed) {
        return res.status(204).end();
      }
      res.status(404).end();

      // meter operation usage
      helpers.reportOperationUsageWithoutWaiting({edvId});
    }));
});
