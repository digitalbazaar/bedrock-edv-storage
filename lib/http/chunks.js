/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as chunks from '../storage/chunks.js';
import * as helpers from '../helpers.js';
import * as middleware from './middleware.js';
import {asyncHandler} from '@bedrock/express';
import {createValidateMiddleware as validate} from '@bedrock/validation';
import {postChunkBody} from '../../schemas/bedrock-edv-storage.js';
import {reportOperationUsage} from './metering.js';

const {cors} = middleware;
const {util: {BedrockError}} = bedrock;

bedrock.events.on('bedrock-express.configure.routes', app => {
  const routes = helpers.getRoutes();

  /* Note: CORS is used on all endpoints. This is safe because authorization
  uses HTTP signatures + capabilities, not cookies; CSRF is not possible. */

  // store a document chunk
  app.options(routes.chunk, cors());
  app.post(
    routes.chunk,
    cors(),
    validate({bodySchema: postChunkBody}),
    middleware.getEdvConfig,
    middleware.authorizeEdvZcapInvocation(),
    asyncHandler(async (req, res) => {
      const {docId} = req.params;
      helpers.assert128BitId(docId);
      const {id: edvId} = req.edv.config;
      // TODO: add document ID to the chunk as well -- as a sanity check?
      /*if(req.body.document !== docId) {
        throw new BedrockError(
          'Could not update document chunk; ID does not match.',
          'DataError', {public: true, httpStatusCode: 400});
      }*/
      await chunks.update({edvId, docId, chunk: req.body});
      res.status(204).end();

      // meter operation usage
      reportOperationUsage({req});
    }));

  // get a document chunk
  app.get(
    routes.chunk,
    cors(),
    middleware.getEdvConfig,
    middleware.authorizeEdvZcapInvocation(),
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
      const {id: edvId} = req.edv.config;
      const {chunk} = await chunks.get({edvId, docId, chunkIndex});

      // TODO: need to determine how to filter the recipients to include
      // in the JWE (use specified recipient key in the JWE or invoker ID
      // somehow)

      res.json(chunk);

      // meter operation usage
      reportOperationUsage({req});
    }));

  // delete a document chunk
  app.delete(
    routes.chunk,
    cors(),
    middleware.getEdvConfig,
    middleware.authorizeEdvZcapInvocation(),
    asyncHandler(async (req, res) => {
      const {docId, chunkIndex} = req.params;
      helpers.assert128BitId(docId);
      const {id: edvId} = req.edv.config;
      const removed = await chunks.remove({edvId, docId, chunkIndex});
      if(removed) {
        return res.status(204).end();
      }
      res.status(404).end();

      // meter operation usage
      reportOperationUsage({req});
    }));
});
