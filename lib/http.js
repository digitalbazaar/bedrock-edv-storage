/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {asyncHandler} = require('bedrock-express');
const {
  authorizeZcapInvocation, authorizeZcapRevocation
} = require('@digitalbazaar/ezcap-express');
const bedrock = require('bedrock');
require('bedrock-express');
const brZCapStorage = require('bedrock-zcap-storage');
const {config, util: {BedrockError}} = bedrock;
const cors = require('cors');
const {documentLoader} = require('./documentLoader');
const {Ed25519Signature2020} = require('@digitalbazaar/ed25519-signature-2020');
const helpers = require('./helpers');
const {meters} = require('bedrock-meter-usage-reporter');
const storage = require('./storage');
const {validate} = require('bedrock-validation');
const logger = require('./logger');

// configure usage aggregator for webkms meters
const SERVICE_TYPE = 'edv';
meters.setAggregator({serviceType: SERVICE_TYPE, handler: _aggregateUsage});

// FIXME: consider splitting http routes into edvs, docs, chunks, and
// revocations files

bedrock.events.on('bedrock-express.configure.routes', app => {
  const cfg = config['edv-storage'];

  // Note: EDV routes are fixed off of the base path per the spec
  const routes = {...cfg.routes};
  routes.edvs = routes.basePath;
  routes.edv = `${routes.edvs}/:edvId`;
  routes.documents = `${routes.edv}/documents`;
  routes.document = `${routes.documents}/:docId`;
  routes.chunk = `${routes.document}/chunks/:chunkIndex`;
  routes.query = `${routes.edv}/query`;
  routes.revocations = `${routes.edv}/revocations/:zcapId`;

  const {baseUri} = config.server;
  const baseStorageUrl = `${baseUri}${routes.edvs}`;

  /* Note: CORS is used on all endpoints. This is safe because authorization
  uses HTTP signatures + capabilities, not cookies; CSRF is not possible. */

  // create a new EDV
  app.post(
    routes.edvs,
    cors(),
    // FIXME: directly import schemas, don't use reference-by-name
    validate('bedrock-edv-storage.config'),
    // meter must be checked for available usage and to obtain the meter's
    // controller prior to checking the zcap invocation (as the invocation
    // will use the meter's controller as the root controller for EDV
    // creation)
    asyncHandler(async (req, res, next) => {
      const {body: {meterId}} = req;
      const {meter, hasAvailable} = await meters.hasAvailable({
        meterId, serviceType: SERVICE_TYPE,
        resources: {storage: cfg.storageCost.edv}
      });
      // store meter information on `req` and call next middleware
      req.meterCheck = {meter, hasAvailable};
      // call `next` on the next tick to ensure the promise from this function
      // resolves and does not reject because some subsequent middleware throws
      // an error
      process.nextTick(next);
    }),
    // now that the meter information has been obtained, check zcap invocation
    _authorizeZcapInvocation({
      async getExpectedTarget({req}) {
        // use root edv endpoint as expected target; controller will
        // be dynamically set according to the meter referenced by the meter
        // capability
        const expectedTarget = `https://${req.get('host')}${routes.edvs}`;
        return {expectedTarget};
      },
      async getRootController({req, rootInvocationTarget}) {
        const edvRoot = `https://${req.get('host')}${routes.edvs}`;
        if(rootInvocationTarget !== edvRoot) {
          throw new BedrockError(
            'The request URL does not match the root invocation target. ' +
            'Ensure that the capability is for the root edvs endpoint. ',
            'URLMismatchError', {
              // this error will be a `cause` in the onError handler below
              // this httpStatusCode is not operative
              httpStatusCode: 400,
              public: true,
              rootInvocationTarget,
              edvRoot
            });
        }
        // use meter's controller as the root controller for the EDV
        // creation endpoint
        return req.meterCheck.meter.controller;
      },
      onError
    }),
    asyncHandler(async (req, res) => {
      const {body: {meterId}, meterCheck: {hasAvailable}} = req;
      if(!hasAvailable) {
        // insufficient remaining storage
        throw new BedrockError('Permission denied.', 'NotAllowedError', {
          httpStatusCode: 403,
          public: true,
        });
      }

      // FIXME: this is a high-latency call -- consider adding the meter
      // in parallel with inserting the EDV, optimistically presuming it
      // will be added; we could decide that the case of a missing/invalid
      // meter is a possible state we have to deal in other cases anyway
      // https://github.com/digitalbazaar/bedrock-edv-storage/issues/82

      // add meter
      await meters.upsert({id: meterId, serviceType: SERVICE_TYPE});

      // do not allow client to choose EDV ID; client may only choose doc IDs
      delete req.body.id;
      const id = helpers.getEdvId({localId: await helpers.generateRandom()});
      const config = {id, ...req.body};

      // create an EDV for the controller
      const record = await storage.insertConfig({config});
      res.status(201).location(id).json(record.config);
    }));

  // get EDVs by query
  app.get(
    routes.edvs,
    cors(),
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
    validate('bedrock-edv-storage.config'),
    asyncHandler(async (req, res) => {
      const {actor} = (req.user || {});
      const id = helpers.getEdvId({localId: req.params.edvId});
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
    asyncHandler(async (req, res) => {
      const {actor = null} = (req.user || {});
      const id = helpers.getEdvId({localId: req.params.edvId});
      const {config} = await storage.getConfig({actor, id});
      res.json(config);
    }));

  // insert a document
  app.options(routes.documents, cors());
  app.post(
    routes.documents,
    // CORs is safe because authorization uses HTTP signatures + capabilities,
    // not cookies
    cors(),
    // FIXME: update to use ezcap-express
    //helpers.verifyDigestHeaderValue,
    validate('bedrock-edv-storage.document'),
    asyncHandler(async (req, res) => {
      // check authorization
      const edvId = helpers.getEdvId({localId: req.params.edvId});
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
    // FIXME: update to use ezcap-express
    //helpers.verifyDigestHeaderValue,
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
      const edvId = helpers.getEdvId({localId: req.params.edvId});
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
      const edvId = helpers.getEdvId({localId: req.params.edvId});
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
    // FIXME: update to use ezcap-express
    //helpers.verifyDigestHeaderValue,
    validate('bedrock-edv-storage.postDocumentQuery'),
    asyncHandler(async (req, res) => {
      // check authorization
      const edvId = helpers.getEdvId({localId: req.params.edvId});
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
    // FIXME: update to use ezcap-express
    //helpers.verifyDigestHeaderValue,
    validate('bedrock-edv-storage.chunk'),
    asyncHandler(async (req, res) => {
      // check authorization
      const {docId} = req.params;
      helpers.assert128BitId(docId);
      const edvId = helpers.getEdvId({localId: req.params.edvId});
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
      const edvId = helpers.getEdvId({localId: req.params.edvId});
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
      const edvId = helpers.getEdvId({localId: req.params.edvId});
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

  // insert a revocation
  app.options(routes.revocations, cors());
  app.post(
    routes.revocations,
    cors(),
    // FIXME: update
    validate('bedrock-edv-storage.zcap'),
    //validate({bodySchema: postRevocationBody}),
    authorizeZcapRevocation({
      expectedHost: config.server.host,
      getRootController: _getRootController,
      documentLoader,
      async getExpectedTarget({req}) {
        const edvId = helpers.getEdvId({localId: req.params.edvId});
        // ensure EDV can be retrieved
        await storage.getConfig({id: edvId, req});
        // allow target to be root EDV, main revocations endpoint, *or*
        // zcap-specific revocation endpoint; see ezcap-express for more
        const revocations = `${edvId}/revocations`;
        const revokeZcap = `${revocations}/` +
          encodeURIComponent(req.params.zcapId);
        return {expectedTarget: [edvId, revocations, revokeZcap]};
      },
      suiteFactory() {
        return new Ed25519Signature2020();
      },
      inspectCapabilityChain: helpers.inspectCapabilityChain,
      onError
    }),
    asyncHandler(async (req, res) => {
      const {body: capability, zcapRevocation: {delegator}} = req;

      // FIXME: brZCapStorage needs to support getting a count on stored
      // revocations -- and that count needs to be filtered based on a
      // particular meter
      // https://github.com/digitalbazaar/bedrock-kms-http/issues/55

      // record revocation
      await brZCapStorage.revocations.insert({delegator, capability});

      // meter revocation usage
      const edvId = helpers.getEdvId({localId: req.params.edvId});

      _reportRevocationUsage({edvId}).catch(
        error => logger.error(
          `EDV (${edvId}) capability revocation meter ` +
          'usage error.', {error}));

      res.status(204).end();
    }));
});

async function _getRootController({
  req, rootCapabilityId, rootInvocationTarget
}) {
  const kmsBaseUrl = req.protocol + '://' + req.get('host') +
    config['kms-http'].routes.basePath;

  // get controller for the entire KMS
  if(rootInvocationTarget === kmsBaseUrl) {
    throw new Error(`Invalid root invocation target "${kmsBaseUrl}".`);
  }

  // get controller for an individual keystore
  let controller;
  try {
    ({controller} = await storage.get({id: rootInvocationTarget, req}));
  } catch(e) {
    if(e.type === 'NotFoundError') {
      const url = req.protocol + '://' + req.get('host') + req.url;
      throw new Error(
        `Invalid capability identifier "${rootCapabilityId}" ` +
        `for URL "${url}".`);
    }
    throw e;
  }
  return controller;
}

async function _aggregateUsage({meter, signal} = {}) {
  const {id: meterId} = meter;
  const [usage, revocationCount] = await Promise.all([
    // FIXME: implement `storage.getUsage()`
    //storage.getStorageUsage({meterId, signal}),
    {storage: 0},
    // FIXME: get zcap revocation count associated with this meter
    // https://github.com/digitalbazaar/bedrock-kms-http/issues/55
    0
  ]);

  // sum edv storage and revocation storage
  const {storageCost} = config['edv-storage'];
  usage.storage += revocationCount * storageCost.revocation;

  return usage;
}

function _authorizeZcapInvocation({
  getExpectedTarget, getRootController = _getRootController,
  expectedAction, onError
} = {}) {
  return authorizeZcapInvocation({
    expectedHost: config.server.host,
    getRootController,
    documentLoader,
    getExpectedTarget,
    expectedAction,
    logger,
    onError,
  });
}

async function _getExpectedKeystoreTarget({req}) {
  // ensure the `configId` matches the request URL (i.e., that the caller
  // POSTed a config with an ID that matches up with the URL to which they
  // POSTed); this is not a security issue if this check is not performed,
  // however, it can help clients debug errors on their end
  const {body: {id: configId}} = req;
  const requestUrl = `${req.protocol}://${req.get('host')}${req.url}`;
  if(configId !== requestUrl) {
    throw new BedrockError(
      'The request URL does not match the configuration ID.',
      'URLMismatchError', {
        // this error will be a `cause` in the onError handler below
        // this httpStatusCode is not operative
        httpStatusCode: 400,
        public: true,
        configId,
        requestUrl,
      });
  }
  return {expectedTarget: configId};
}

function onError({error}) {
  // cause must be a public BedrockError to be surfaced to the HTTP client
  let cause;
  if(error instanceof BedrockError) {
    cause = error;
  } else {
    cause = new BedrockError(
      error.message,
      error.name || 'NotAllowedError', {
        ...error.details,
        public: true,
      });
  }
  throw new BedrockError(
    'Authorization error.', 'NotAllowedError', {
      httpStatusCode: 403,
      public: true,
    }, cause);
}

async function _reportOperationUsage({req}) {
  // FIXME:
  // do not wait for usage to be reported
  //const {meterId: id} = req.webkms.keystore;
  const id = '1234';
  meters.use({id, operations: 1}).catch(
    error => logger.error(`Meter (${id}) usage error.`, {error}));
}

async function _reportRevocationUsage({edvId}) {
  const config = await storage.getConfig({id: edvId});
  await meters.use({id: config.meterId, operations: 1});
}
