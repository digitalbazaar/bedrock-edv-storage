/*!
 * Copyright (c) 2018-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as docs from '../storage/docs.js';
import * as helpers from '../helpers.js';
import * as middleware from './middleware.js';
import {
  postDocumentBody, postDocumentQueryBody
} from '../../schemas/bedrock-edv-storage.js';
import {asyncHandler} from '@bedrock/express';
import {reportOperationUsage} from './metering.js';
import {createValidateMiddleware as validate} from '@bedrock/validation';

const {cors} = middleware;
const {util: {BedrockError}} = bedrock;

bedrock.events.on('bedrock-express.configure.routes', app => {
  const routes = helpers.getRoutes();

  /* Note: CORS is used on all endpoints. This is safe because authorization
  uses HTTP signatures + capabilities, not cookies; CSRF is not possible. */

  // insert a document
  app.options(routes.documents, cors());
  app.post(
    routes.documents,
    cors(),
    validate({bodySchema: postDocumentBody}),
    middleware.getEdvConfig,
    middleware.authorizeEdvZcapInvocation(),
    asyncHandler(async (req, res) => {
      const {id: edvId} = req.edv.config;
      const {doc} = await docs.insert({edvId, doc: req.body});
      const location = `${edvId}/documents/${doc.id}`;
      res.status(201).location(location).end();

      // meter operation usage
      reportOperationUsage({req});
    }));

  // query for documents at `/documents/query`
  app.options(routes.documents + '/query', cors());
  app.post(
    routes.documents + '/query',
    cors(),
    validate({bodySchema: postDocumentQueryBody}),
    middleware.getEdvConfig,
    middleware.authorizeEdvZcapInvocation({
      // must set expected action to `read` since default for `post` is `write`
      expectedAction: 'read'
    }),
    asyncHandler(handleQuery));

  // update a document
  app.options(routes.document, cors());
  app.post(
    routes.document,
    cors(),
    validate({bodySchema: postDocumentBody}),
    middleware.getEdvConfig,
    middleware.authorizeEdvZcapInvocation(),
    asyncHandler(async (req, res) => {
      const {docId: id} = req.params;
      helpers.assert128BitId(id);
      if(req.body.id !== id) {
        throw new BedrockError(
          'Could not update document; ID does not match.',
          'DataError', {public: true, httpStatusCode: 400});
      }
      const {id: edvId} = req.edv.config;
      await docs.update({edvId, doc: req.body});
      res.status(204).end();

      // meter operation usage
      reportOperationUsage({req});
    }));

  // get a document
  app.get(
    routes.document,
    cors(),
    middleware.getEdvConfig,
    middleware.authorizeEdvZcapInvocation(),
    asyncHandler(async (req, res) => {
      const {docId: id} = req.params;
      helpers.assert128BitId(id);
      const {id: edvId} = req.edv.config;
      const {doc} = await docs.get({edvId, id});

      helpers.sendCacheableJson({res, obj: doc});

      // meter operation usage
      reportOperationUsage({req});
    }));

  // query for documents
  app.options(routes.query, cors());
  app.post(
    routes.query,
    cors(),
    validate({bodySchema: postDocumentQueryBody}),
    middleware.getEdvConfig,
    middleware.authorizeEdvZcapInvocation({
      // must set expected action to `read` since default for `post` is `write`
      expectedAction: 'read'
    }),
    asyncHandler(handleQuery));
});

async function handleQuery(req, res) {
  const {id: edvId} = req.edv.config;
  // default `returnDocuments` to true for backwards compatibility
  const returnDocuments = !(req.query.returnDocuments === 'false' ||
    req.body.returnDocuments === false);
  const {index, equals, has, count, limit} = req.body;
  const query = docs.buildQuery({index, equals, has});
  if(count) {
    res.json({count: await docs.count({edvId, query})});
    return;
  }

  const options = {projection: {_id: 0}};
  if(returnDocuments) {
    // return entire doc from database
    options.projection.doc = 1;
  } else {
    // doc ID only option is used: only return `doc.id` from database
    options.projection['doc.id'] = 1;
  }
  if(limit === undefined) {
    // max of `1000`
    options.limit = 1000;
  } else {
    // add `1` to limit to detect if more results were possible
    options.limit = limit + 1;
  }
  const {documents} = await docs.find({edvId, query, options});

  const results = {};

  /* Note: Current implementation does not return a `cursor` value to
  allow a search to be continued from where it left off. This will have to
  be added in future versions and will involve passing a sort option.
  Ideally, the cursor value will be opaque to clients and they will just
  pass it to continue paginated queries. */

  // indicate whether there are more results or not
  results.hasMore = documents.length > limit;
  if(results.hasMore) {
    documents.length = limit;
  }

  if(returnDocuments) {
    results.documents = documents.map(r => r.doc);
  } else {
    results.documentIds = documents.map(r => r.doc.id);
  }
  res.json(results);

  // meter operation usage
  reportOperationUsage({req});
}
