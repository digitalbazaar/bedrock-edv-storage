/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {asyncHandler} = require('bedrock-express');
const bedrock = require('bedrock');
require('bedrock-express');
const {util: {BedrockError}} = bedrock;
const cors = require('cors');
const helpers = require('../helpers');
const docs = require('../storage/docs.js');
const middleware = require('./middleware.js');
const {reportOperationUsage} = require('./metering');
const {validate} = require('../validator.js');
const {
  postDocumentBody, postDocumentQueryBody
} = require('../../schemas/bedrock-edv-storage');

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

      res.json(doc);

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
  const {index, equals, has, count} = req.body;
  let query = {'doc.indexed.hmac.id': index};
  if(equals) {
    const $or = [];
    const allStrings = equals.every(e => {
      const $all = [];
      for(const key in e) {
        if(typeof e[key] !== 'string') {
          return false;
        }
        $all.push({$elemMatch: {name: key, value: e[key]}});
      }
      $or.push({
        ...query,
        'doc.indexed.attributes': {
          $all
        }
      });
      return true;
    });
    query = {$or};
    if(!allStrings) {
      throw new BedrockError(
        'Invalid "equals" query; each array element must be an object ' +
        'with keys that have values that are strings.',
        'DataError', {public: true, httpStatusCode: 400});
    }
  } else {
    // `has` query
    query['doc.indexed.attributes.name'] = {$all: has};
  }
  if(count) {
    res.json({count: await docs.count({edvId, query})});
    return;
  }
  const results = await docs.find({
    edvId, query,
    options: {projection: {_id: 0, doc: 1}}
  });

  results.documents = results.documents.map(r => r.doc);
  res.json(results);

  // meter operation usage
  reportOperationUsage({req});
}
