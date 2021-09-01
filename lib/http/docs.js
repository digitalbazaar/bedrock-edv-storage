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
const docs = require('../storage/docs.js');
const {validate} = require('../validator.js');
const {
  postDocumentBody, postDocumentQueryBody
} = require('../../schemas/bedrock-edv-storage');

bedrock.events.on('bedrock-express.configure.routes', app => {
  const routes = helpers.getRoutes();

  // authz for doc endpoints
  const authorizeDocZcapInvocation = authz.authorizeDocZcapInvocation();

  /* Note: CORS is used on all endpoints. This is safe because authorization
  uses HTTP signatures + capabilities, not cookies; CSRF is not possible. */

  // insert a document
  app.options(routes.documents, cors());
  app.post(
    routes.documents,
    cors(),
    validate({bodySchema: postDocumentBody}),
    authz.authorizeZcapInvocation({
      async getExpectedTarget({req}) {
        // expected target is the EDV itself or `/documents`
        const edvId = helpers.getEdvId({localId: req.params.edvId});
        return {expectedTarget: [edvId, `${edvId}/documents`]};
      }
    }),
    asyncHandler(async (req, res) => {
      const edvId = helpers.getEdvId({localId: req.params.edvId});
      const {doc} = await docs.insert({edvId, doc: req.body});
      const location = `${edvId}/documents/${doc.id}`;
      res.status(201).location(location).end();

      // meter operation usage
      helpers.reportOperationUsageWithoutWaiting({edvId});
    }));

  // update a document
  app.options(routes.document, cors());
  app.post(
    routes.document,
    cors(),
    validate({bodySchema: postDocumentBody}),
    authorizeDocZcapInvocation,
    asyncHandler(async (req, res) => {
      const {docId: id} = req.params;
      helpers.assert128BitId(id);
      if(req.body.id !== id) {
        throw new BedrockError(
          'Could not update document; ID does not match.',
          'DataError', {public: true, httpStatusCode: 400});
      }
      const edvId = helpers.getEdvId({localId: req.params.edvId});
      await docs.update({edvId, doc: req.body});
      res.status(204).end();

      // meter operation usage
      helpers.reportOperationUsageWithoutWaiting({edvId});
    }));

  // get a document
  app.get(
    routes.document,
    cors(),
    authorizeDocZcapInvocation,
    asyncHandler(async (req, res) => {
      const {docId: id} = req.params;
      helpers.assert128BitId(id);
      const edvId = helpers.getEdvId({localId: req.params.edvId});
      const {doc} = await docs.get({edvId, id});

      // TODO: need to determine how to filter the recipients to include
      // in the JWE (use specified recipient key in the JWE or invoker ID
      // somehow)

      res.json(doc);

      // meter operation usage
      helpers.reportOperationUsageWithoutWaiting({edvId});
    }));

  // query for documents
  app.options(routes.query, cors());
  app.post(
    routes.query,
    cors(),
    validate({bodySchema: postDocumentQueryBody}),
    authz.authorizeZcapInvocation({
      // must set expected action to `read` since default for `post` is `write`
      getExpectedAction() {
        return 'read';
      },
      async getExpectedTarget({req}) {
        // expected target is the EDV itself, `/documents`, or `/query`
        const edvId = helpers.getEdvId({localId: req.params.edvId});
        return {
          expectedTarget: [edvId, `${edvId}/documents`, `${edvId}/query`]
        };
      }
    }),
    asyncHandler(async (req, res) => {
      const edvId = helpers.getEdvId({localId: req.params.edvId});
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

      // TODO: need to determine how to filter the recipients to include
      // in the JWE (use specified recipient key in the JWE or invoker ID
      // somehow) ... or change this API to return only doc IDs
      results.documents = results.documents.map(r => r.doc);
      res.json(results);

      // meter operation usage
      helpers.reportOperationUsageWithoutWaiting({edvId});
    }));
});
