/*!
 * Copyright (c) 2018-2026 Digital Bazaar, Inc.
 */
import * as bedrock from '@bedrock/core';
import * as chunks from '../storage/chunks.js';
import * as helpers from '../helpers.js';
import * as middleware from './middleware.js';
import {reportOperationUsage, SERVICE_TYPE} from './metering.js';
import {asyncHandler} from '@bedrock/express';
import {meters} from '@bedrock/meter-usage-reporter';
import {postChunkBody} from '../../schemas/bedrock-edv-storage.js';
import {createValidateMiddleware as validate} from '@bedrock/validation';

const {cors} = middleware;
const {util: {BedrockError}} = bedrock;

bedrock.events.on('bedrock-express.configure.routes', app => {
  const cfg = bedrock.config['edv-storage'];
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

      const chunkIndex = _parseChunkIndex({req, docId});

      // check meter limits
      const {meterId} = req.edv.config;
      const {hasAvailable} = await meters.hasAvailable({
        id: meterId, serviceType: SERVICE_TYPE,
        resources: {storage: cfg.storageCost.chunk}
      });
      if(!hasAvailable) {
        // do an extra check to see if the chunk already exists or not;
        // if it exists, allow the update as it adds no additional storage,
        // otherwise block it
        if(!await chunks.get({edvId, docId, chunkIndex})) {
          // chunk not found and insufficient remaining storage to add it
          throw new BedrockError('Permission denied.', {
            name: 'NotAllowedError',
            details: {httpStatusCode: 403, public: true}
          });
        }
      }

      // do update
      const result = await chunks.update({
        edvId, docId, chunk: req.body, returnDetails: true
      });

      res.status(204).end();

      // meter usage
      const storage = result.upserted ? cfg.storageCost.chunk : 0;
      reportOperationUsage({req, storage});
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
      const chunkIndex = _parseChunkIndex({req, docId});
      const {id: edvId} = req.edv.config;
      const {chunk} = await chunks.get({edvId, docId, chunkIndex});

      // TODO: need to determine how to filter the recipients to include
      // in the JWE (use specified recipient key in the JWE or invoker ID
      // somehow)

      helpers.sendCacheableJson({res, obj: chunk});

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
      // validate `chunkIndex`
      const {docId} = req.params;
      helpers.assert128BitId(docId);
      const chunkIndex = _parseChunkIndex({req, docId});
      const {id: edvId} = req.edv.config;
      const removed = await chunks.remove({edvId, docId, chunkIndex});
      if(removed) {
        // meter usage
        reportOperationUsage({req, storage: -cfg.storageCost.chunk});
        return res.status(204).end();
      }
      res.status(404).end();

      // meter operation usage
      reportOperationUsage({req});
    }));
});

function _parseChunkIndex({req, docId}) {
  let {chunkIndex} = req.params;
  const length = chunkIndex.length;
  try {
    chunkIndex = parseInt(chunkIndex, 10);
    if(!(chunkIndex >= 0 && Number.isSafeInteger(chunkIndex)) &&
      chunkIndex.toString().length === length) {
      throw new Error('Invalid chunk index.');
    }
    return chunkIndex;
  } catch {
    // invalid chunk index, report not found
    throw new BedrockError(
      'Encrypted data vault document chunk not found.',
      'NotFoundError',
      {document: docId, chunkIndex, httpStatusCode: 404, public: true});
  }
}
