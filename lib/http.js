/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {asyncHandler} = require('bedrock-express');
const bedrock = require('bedrock');
const brPassport = require('bedrock-passport');
const brZCapStorage = require('bedrock-zcap-storage');
const {config, util: {BedrockError}} = bedrock;
const cors = require('cors');
const database = require('bedrock-mongodb');
const helpers = require('./helpers');
const storage = require('./storage');
const {validate} = require('bedrock-validation');
require('bedrock-express');
require('bedrock-did-context');
require('bedrock-veres-one-context');

const {ensureAuthenticated} = brPassport;

// Note: edv routes are not configurable per the spec
const routes = {
  edvs: '/edvs',
  edv: '/edvs/:edvId',
  documents: '/edvs/:edvId/documents',
  document: '/edvs/:edvId/documents/:docId',
  chunk: '/edvs/:edvId/documents/:docId/chunks/:chunkIndex',
  query: '/edvs/:edvId/query',
  authorizations: '/edvs/:edvId/authorizations',
  zcaps: '/edvs/:edvId/zcaps'
};

bedrock.events.on('bedrock-express.configure.routes', app => {
  const {baseUri} = config.server;
  const baseStorageUrl = `${baseUri}${routes.edvs}`;

  function _getEdvId(edvIdParam) {
    helpers.assert128BitId(edvIdParam);
    return `${baseStorageUrl}/${edvIdParam}`;
  }

  // TODO: endpoints for creating and deleting EDVs will only use
  // session-based auth and check a simple permission on the account...
  // the EDV configs should have a controller that is the account ID
  // but they also contain an invoker and delegator field that includes either
  // the account's did:key or a profile DID... the reasoning for this should
  // be explained: creating an EDV requires SPAM prevention, which account
  // creation provides for; just using a DID that exists in the wild
  // doesn't necessarily do that. (EDV spec should explain this noting
  // that APIs and protocols for creating/deleting EDVs may not be part
  // of the standard (rather, only creating/deleting docs) -- really this
  // would then be implementation guidance

  // create a new EDV
  app.post(
    routes.edvs,
    ensureAuthenticated,
    validate('bedrock-edv-storage.config'),
    asyncHandler(async (req, res) => {
      const {actor} = (req.user || {});
      delete req.body.id;
      const id = _getEdvId(await helpers.generateRandom());
      const edvConfig = {id, ...req.body};

      // no zcap was provided, proceed with session authentication/permissions
      if(!req.headers.authorization) {
        const {config} = await storage.insertConfig(
          {actor, config: edvConfig});
        res.status(201).location(id).json(config);
        return;
      }

      // the authenticated account is not the controller
      // check authorization
      const expectedTarget = baseStorageUrl;
      const expectedRootCapability = `${baseStorageUrl}/zcaps/configs`;
      const expectedController = edvConfig.controller;
      await helpers.authorize({
        req, expectedController, expectedTarget, expectedRootCapability,
        expectedAction: 'write'
      });
      const {config} = await storage.insertConfig(
        {actor: null, config: edvConfig});
      res.status(201).location(id).json(config);
    }));

  // get EDVs by query
  app.get(
    routes.edvs,
    cors(),
    ensureAuthenticated,
    validate({query: 'bedrock-edv-storage.getEdvsQuery'}),
    asyncHandler(async (req, res) => {
      const {actor = null} = (req.user || {});
      const {controller, referenceId} = req.query;
      const query = {'config.referenceId': referenceId};

      // no zcap was provided
      if(!req.headers.authorization) {
        const results = await storage.findConfig(
          {actor, controller, query, fields: {_id: 0, config: 1}});
        res.json(results.map(r => r.config));
        return;
      }

      // check zcap authorization
      const expectedTarget = baseStorageUrl;
      const expectedController = controller;
      const expectedRootCapability = `${baseStorageUrl}/zcaps/configs`;
      await helpers.authorize({
        req, expectedController, expectedTarget, expectedRootCapability,
        expectedAction: 'read'
      });
      const results = await storage.findConfig(
        {actor: null, controller, query, fields: {_id: 0, config: 1}});
      res.json(results.map(r => r.config));
    }));

  // update a config
  app.post(
    routes.edv,
    ensureAuthenticated,
    validate('bedrock-edv-storage.config'),
    asyncHandler(async (req, res) => {
      const {actor} = (req.user || {});
      const id = _getEdvId(req.params.edvId);
      const config = req.body;
      if(id !== config.id) {
        throw new BedrockError(
          'Configuration "id" does not match.',
          'DataError', {
            httpStatusCode: 400,
            public: true,
            expected: id,
            actual: config.id
          });
      }
      await storage.updateConfig({actor, config});
      res.json(config);
    }));

  // get an EDV config
  app.get(
    routes.edv,
    cors(),
    // TODO: consider making this zcap authorized instead
    ensureAuthenticated,
    asyncHandler(async (req, res) => {
      const {actor = null} = (req.user || {});
      const id = _getEdvId(req.params.edvId);
      const {config} = await storage.getConfig({actor, id});
      res.json(config);
    }));

  // get a root capability for an EDV resource
  app.get(
    routes.zcaps,
    cors(),
    asyncHandler(async (req, res) => {
      // compute invocation target
      const id = `${baseUri}/${req.originalUrl}`;
      // dynamically generate root capability for target
      const zcap = await helpers.generateRootCapability({url: id});
      if(!zcap) {
        // invalid root zcap ID
        throw new BedrockError(
          'Encrypted data vault capability not found.',
          'NotFoundError',
          {id, httpStatusCode: 404, public: true});
      }
      res.json(zcap);
    }));

  // insert a document
  app.options(routes.documents, cors());
  app.post(
    routes.documents,
    // CORs is safe because authorization uses HTTP signatures + capabilities,
    // not cookies
    cors(),
    helpers.verifyDigestHeaderValue,
    validate('bedrock-edv-storage.document'),
    asyncHandler(async (req, res) => {
      // check authorization
      const edvId = _getEdvId(req.params.edvId);
      const expectedTarget = `${edvId}/documents`;
      const expectedRootCapability = `${edvId}/zcaps/documents`;
      await helpers.authorize({
        req, expectedTarget, expectedRootCapability, expectedAction: 'write'
      });

      const {doc} = await storage.insert({edvId, doc: req.body});
      const location = `${edvId}/documents/${doc.id}`;
      res.status(201).location(location).end();
    }));

  // update a document
  app.options(routes.document, cors());
  app.post(
    routes.document,
    // CORs is safe because authorization uses HTTP signatures + capabilities,
    // not cookies
    cors(),
    helpers.verifyDigestHeaderValue,
    validate('bedrock-edv-storage.document'),
    asyncHandler(async (req, res) => {
      // check authorization
      const {docId: id} = req.params;
      helpers.assert128BitId(id);
      if(req.body.id !== id) {
        throw new BedrockError(
          'Could not update document; ID does not match.',
          'DataError', {public: true, httpStatusCode: 400});
      }
      const edvId = _getEdvId(req.params.edvId);
      const docPath = `/documents/${id}`;
      const expectedTarget = [
        `${edvId}${docPath}`,
        `${edvId}/documents`
      ];
      const expectedRootCapability = [
        `${edvId}/zcaps${docPath}`,
        `${edvId}/zcaps/documents`
      ];
      await helpers.authorize({
        req, expectedTarget, expectedRootCapability, expectedAction: 'write'
      });
      await storage.update({edvId, doc: req.body});
      res.status(204).end();
    }));

  // get a document
  app.get(
    routes.document,
    cors(),
    asyncHandler(async (req, res) => {
      // check authorization
      const {docId: id} = req.params;
      helpers.assert128BitId(id);
      const edvId = _getEdvId(req.params.edvId);
      const docPath = `/documents/${id}`;
      const expectedTarget = [
        `${edvId}${docPath}`,
        `${edvId}/documents`
      ];
      const expectedRootCapability = [
        `${edvId}/zcaps${docPath}`,
        `${edvId}/zcaps/documents`
      ];
      await helpers.authorize({
        req, expectedTarget, expectedRootCapability, expectedAction: 'read'
      });

      const {doc} = await storage.get({edvId, id});

      // TODO: need to determine how to filter the recipients to include
      // in the JWE (use specified recipient key in the JWE or invoker ID
      // somehow)

      res.json(doc);
    }));

  // query for documents
  app.options(routes.query, cors());
  app.post(
    routes.query,
    cors(),
    helpers.verifyDigestHeaderValue,
    validate('bedrock-edv-storage.postDocumentQuery'),
    asyncHandler(async (req, res) => {
      // check authorization
      const edvId = _getEdvId(req.params.edvId);
      const expectedTarget = [
        `${edvId}/query`,
        `${edvId}/documents`
      ];
      const expectedRootCapability = [
        `${edvId}/zcaps/query`,
        `${edvId}/zcaps/documents`
      ];
      await helpers.authorize({
        req, expectedTarget, expectedRootCapability, expectedAction: 'read'
      });

      const {index, equals, has, count} = req.body;
      // TODO: database.hash() hmac IDs here and in `storage`?
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
        res.json({count: await storage.count({edvId, query})});
        return;
      }
      const results = await storage.find(
        {edvId, query, fields: {_id: 0, doc: 1}});

      // TODO: need to determine how to filter the recipients to include
      // in the JWE (use specified recipient key in the JWE or invoker ID
      // somehow) ... or change this API to return only doc IDs
      results.documents = results.documents.map(r => r.doc);
      res.json(results);
    }));

  // store a document chunk
  app.options(routes.chunk, cors());
  app.post(
    routes.chunk,
    // CORs is safe because authorization uses HTTP signatures + capabilities,
    // not cookies
    cors(),
    helpers.verifyDigestHeaderValue,
    validate('bedrock-edv-storage.chunk'),
    asyncHandler(async (req, res) => {
      // check authorization
      const {docId} = req.params;
      helpers.assert128BitId(docId);
      const edvId = _getEdvId(req.params.edvId);
      const docPath = `/documents/${docId}`;
      const expectedTarget = [
        `${edvId}${docPath}`,
        `${edvId}/documents`
      ];
      const expectedRootCapability = [
        `${edvId}/zcaps${docPath}`,
        `${edvId}/zcaps/documents`
      ];
      await helpers.authorize({
        req, expectedTarget, expectedRootCapability, expectedAction: 'write'
      });
      // TODO: add document ID to the chunk as well -- as a sanity check?
      /*if(req.body.document !== docId) {
        throw new BedrockError(
          'Could not update document chunk; ID does not match.',
          'DataError', {public: true, httpStatusCode: 400});
      }*/
      await storage.updateChunk({edvId, docId, chunk: req.body});
      res.status(204).end();
    }));

  // get a document chunk
  app.get(
    routes.chunk,
    cors(),
    asyncHandler(async (req, res) => {
      // validate `chunkIndex` and check authorization
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
      const edvId = _getEdvId(req.params.edvId);
      const docPath = `/documents/${docId}`;
      const expectedTarget = [
        `${edvId}${docPath}`,
        `${edvId}/documents`
      ];
      const expectedRootCapability = [
        `${edvId}/zcaps${docPath}`,
        `${edvId}/zcaps/documents`
      ];
      await helpers.authorize({
        req, expectedTarget, expectedRootCapability, expectedAction: 'read'
      });

      const {chunk} = await storage.getChunk({edvId, docId, chunkIndex});
      // TODO: need to determine how to filter the recipients to include
      // in the JWE (use specified recipient key in the JWE or invoker ID
      // somehow)

      res.json(chunk);
    }));

  // delete a document chunk
  app.delete(
    routes.chunk,
    // CORs is safe because authorization uses HTTP signatures + capabilities,
    // not cookies
    cors(),
    asyncHandler(async (req, res) => {
      // check authorization
      const {docId, chunkIndex} = req.params;
      helpers.assert128BitId(docId);
      const edvId = _getEdvId(req.params.edvId);
      const docPath = `/documents/${docId}`;
      const expectedTarget = [
        `${edvId}${docPath}`,
        `${edvId}/documents`
      ];
      const expectedRootCapability = [
        `${edvId}/zcaps${docPath}`,
        `${edvId}/zcaps/documents`
      ];
      await helpers.authorize({
        req, expectedTarget, expectedRootCapability, expectedAction: 'write'
      });

      const removed = await storage.removeChunk({edvId, docId, chunkIndex});

      if(removed) {
        return res.status(204).end();
      }

      res.status(404).end();
    }));

  // insert an authorization
  app.options(routes.authorizations, cors());
  app.post(
    routes.authorizations,
    // CORs is safe because authorization uses HTTP signatures + capabilities,
    // not cookies
    cors(),
    helpers.verifyDigestHeaderValue,
    validate('bedrock-edv-storage.zcap'),
    asyncHandler(async (req, res) => {
      // check authorization
      const edvId = _getEdvId(req.params.edvId);
      const expectedTarget = `${edvId}/authorizations`;
      const expectedRootCapability = `${edvId}/zcaps/authorizations`;
      const {invoker} = await helpers.authorize({
        req, expectedTarget, expectedRootCapability, expectedAction: 'write'
      });

      // verify CapabilityDelegation before storing zcap
      const controller = invoker;
      const capability = req.body;
      await helpers.verifyDelegation({capability, edvId});
      await brZCapStorage.authorizations.insert({controller, capability});
      res.status(204).end();
    }));

  // get one or more authorizations
  app.get(
    routes.authorizations,
    validate({query: 'bedrock-edv-storage.getAuthorizationsQuery'}),
    asyncHandler(async (req, res) => {
      // check authorization
      const edvId = _getEdvId(req.params.edvId);
      const expectedTarget = `${edvId}/authorizations`;
      const expectedRootCapability = `${edvId}/zcaps/authorizations`;
      const {invoker} = await helpers.authorize({
        req, expectedTarget, expectedRootCapability, expectedAction: 'read'
      });

      const {id} = req.query;
      if(id) {
        const {authorization} = await brZCapStorage.authorizations.get(
          {id, controller: invoker});
        const {capability} = authorization;
        res.json(capability);
      } else {
        const query = {controller: database.hash(invoker)};
        const results = await brZCapStorage.authorizations.find(
          {query, fields: {_id: 0, capability: 1}});
        res.json(results.map(r => r.capability));
      }
    }));

  // delete an authorization
  app.delete(
    routes.authorizations,
    // CORs is safe because authorization uses HTTP signatures + capabilities,
    // not cookies
    cors(),
    validate({query: 'bedrock-edv-storage.getAuthorizationsQuery'}),
    asyncHandler(async (req, res) => {
      // check authorization
      const edvId = _getEdvId(req.params.edvId);
      const expectedTarget = `${edvId}/authorizations`;
      const expectedRootCapability = `${edvId}/zcaps/authorizations`;
      const {invoker} = await helpers.authorize({
        req, expectedTarget, expectedRootCapability, expectedAction: 'write'
      });

      // require invoker to be a root delegator
      const {config} = await storage.getConfig({actor: null, id: edvId});
      let delegator = config.delegator || config.controller;
      if(!Array.isArray(delegator)) {
        delegator = [delegator];
      }
      if(!delegator.includes(invoker)) {
        throw new BedrockError(
          'Delegated capabilities may only be removed by a root delegator.',
          'NotAllowedError', {
            public: true,
            httpStatusCode: 400,
            invoker,
            delegator
          });
      }
      const {id} = req.query;
      const removed = await brZCapStorage.authorizations.remove(
        {controller: invoker, id});
      if(removed) {
        res.status(204).end();
      } else {
        res.status(404).end();
      }
    }));
});
