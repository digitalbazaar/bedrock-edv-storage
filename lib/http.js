/*!
 * Copyright (c) 2018-2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const asyncHandler = require('express-async-handler');
const base58 = require('bs58');
const bedrock = require('bedrock');
const brPassport = require('bedrock-passport');
const brZCapStorage = require('bedrock-zcap-storage');
const {config} = bedrock;
const cors = require('cors');
const crypto = require('crypto');
const database = require('bedrock-mongodb');
const jsigs = require('jsonld-signatures');
const {verifyCapabilityInvocation} = require('http-signature-zcap-verify');
const storage = require('./storage');
const {validate} = require('bedrock-validation');
const {promisify} = require('util');
const getRandomBytes = promisify(crypto.randomBytes);
const {extendContextLoader, SECURITY_CONTEXT_V2_URL} = jsigs;
const {Ed25519Signature2018} = jsigs.suites;
const {CapabilityDelegation} = require('ocapld');
require('bedrock-express');
const {
  ensureAuthenticated
} = brPassport;
const {BedrockError} = bedrock.util;

// load config defaults
require('./config');

// module API
const api = {};
module.exports = api;

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
    _assert128BitId(edvIdParam);
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
      const id = _getEdvId(await _generateRandom());
      const {config} = await storage.insertConfig(
        {actor, config: {id, ...req.body}});
      res.status(201).location(id).json(config);
    }));

  // get EDVs by query
  app.get(
    routes.edvs,
    cors(),
    ensureAuthenticated,
    // TODO: implement query validator
    //validate('bedrock-edv-storage.foo'),
    asyncHandler(async (req, res) => {
      const {actor = null} = (req.user || {});
      const {controller, referenceId} = req.query;
      if(!controller) {
        throw new BedrockError(
          'Query not supported; a "controller" must be specified.',
          'NotSupportedError', {public: true, httpStatusCode: 400});
      }
      if(!referenceId) {
        // query for all EDVs controlled by controller not implemented yet
        // TODO: implement
        throw new BedrockError(
          'Query not supported; a "referenceId" must be specified.',
          'NotSupportedError', {public: true, httpStatusCode: 400});
      }
      const query = {'config.referenceId': referenceId};
      const results = await storage.findConfig(
        {actor, controller, query, fields: {_id: 0, config: 1}});
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
      const zcap = await _generateRootCapability(id);
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
    validate('bedrock-edv-storage.document'),
    asyncHandler(async (req, res) => {
      // check authorization
      const edvId = _getEdvId(req.params.edvId);
      const expectedTarget = `${edvId}/documents`;
      const expectedRootCapability = `${edvId}/zcaps/documents`;
      await _authorize({
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
    validate('bedrock-edv-storage.document'),
    asyncHandler(async (req, res) => {
      // check authorization
      const {docId: id} = req.params;
      _assert128BitId(id);
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
      await _authorize({
        req, expectedTarget, expectedRootCapability, expectedAction: 'write'
      });

      if(req.body.id !== id) {
        throw new BedrockError(
          'Could not update document; ID does not match.',
          'DataError', {public: true, httpStatusCode: 400});
      }
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
      _assert128BitId(id);
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
      await _authorize({
        req, expectedTarget, expectedRootCapability, expectedAction: 'read'
      });

      const {doc} = await storage.get({edvId, id});

      // TODO: need to determine how to filter the recipients to include
      // in the JWE (use specified recipient key in the JWE or invoker ID
      // somehow)

      res.json(doc);
    }));

  // delete a document
  app.delete(
    routes.document,
    // CORs is safe because authorization uses HTTP signatures + capabilities,
    // not cookies
    cors(),
    asyncHandler(async (req, res) => {
      // check authorization
      const {docId: id} = req.params;
      _assert128BitId(id);
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
      await _authorize({
        req, expectedTarget, expectedRootCapability, expectedAction: 'write'
      });

      const removed = await storage.remove({edvId, id});
      if(removed) {
        res.status(204).end();
      } else {
        res.status(404).end();
      }
    }));

  // query for documents
  app.options(routes.query, cors());
  app.post(
    routes.query,
    cors(),
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
      await _authorize({
        req, expectedTarget, expectedRootCapability, expectedAction: 'read'
      });

      const {index, equals, has} = req.body;
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
      const results = await storage.find(
        {edvId, query, fields: {_id: 0, doc: 1}});

      // TODO: need to determine how to filter the recipients to include
      // in the JWE (use specified recipient key in the JWE or invoker ID
      // somehow) ... or change this API to return only doc IDs

      res.json(results.map(r => r.doc));
    }));

  // store a document chunk
  app.options(routes.chunk, cors());
  app.post(
    routes.chunk,
    // CORs is safe because authorization uses HTTP signatures + capabilities,
    // not cookies
    cors(),
    validate('bedrock-edv-storage.chunk'),
    asyncHandler(async (req, res) => {
      // check authorization
      const {docId} = req.params;
      _assert128BitId(docId);
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
      await _authorize({
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
      _assert128BitId(docId);
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
      await _authorize({
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
      _assert128BitId(docId);
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
      await _authorize({
        req, expectedTarget, expectedRootCapability, expectedAction: 'write'
      });

      const removed = await storage.remove({edvId, docId, chunkIndex});
      if(removed) {
        res.status(204).end();
      } else {
        res.status(404).end();
      }
    }));

  // insert an authorization
  app.options(routes.authorizations, cors());
  app.post(
    routes.authorizations,
    // CORs is safe because authorization uses HTTP signatures + capabilities,
    // not cookies
    cors(),
    // TODO: add zcap validator
    //validate('bedrock-edv-storage.zcap'),
    asyncHandler(async (req, res) => {
      // check authorization
      const edvId = _getEdvId(req.params.edvId);
      const expectedTarget = `${edvId}/authorizations`;
      const expectedRootCapability = `${edvId}/zcaps/authorizations`;
      const {invoker} = await _authorize({
        req, expectedTarget, expectedRootCapability, expectedAction: 'write'
      });

      // verify CapabilityDelegation before storing zcap
      const controller = invoker;
      const capability = req.body;
      await _verifyDelegation({edvId, controller, capability});
      await brZCapStorage.authorizations.insert({controller, capability});
      res.status(204).end();
    }));

  // get one or more authorizations
  app.get(
    routes.authorizations,
    asyncHandler(async (req, res) => {
      // check authorization
      const edvId = _getEdvId(req.params.edvId);
      const expectedTarget = `${edvId}/authorizations`;
      const expectedRootCapability = `${edvId}/zcaps/authorizations`;
      const {invoker} = await _authorize({
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
    asyncHandler(async (req, res) => {
      // check authorization
      const edvId = _getEdvId(req.params.edvId);
      const expectedTarget = `${edvId}/authorizations`;
      const expectedRootCapability = `${edvId}/zcaps/authorizations`;
      const {invoker} = await _authorize({
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

// TODO: some of the following code is a target for reusability in other
// modules and should be factored out for reuse

// Note: for dereferencing `did:key` URLs
const DOCUMENT_LOADER = async url => {
  // TODO: move to did-key lib
  if(url.startsWith('did:key:')) {
    const publicKeyBase58 = _parsePublicKeyBase58(url);
    return {
      contextUrl: null,
      documentUrl: url,
      document: {
        '@context': SECURITY_CONTEXT_V2_URL,
        id: url,
        publicKey: [{
          id: url,
          // TODO: determine from parsing multibase key
          type: 'Ed25519VerificationKey2018',
          controller: url,
          publicKeyBase58
        }],
        authentication: [url],
        assertionMethod: [url],
        capabilityDelegation: [url],
        capabilityInvocation: [url]
      }
    };
  }
  const error = new Error(`Dereferencing url "${url}" is prohibited.`);
  error.name = 'NotAllowedError';
  error.httpStatusCode = 400;
  throw error;
};

async function _verifyDelegation({/*edvId, controller,*/capability}) {
  const invocationTarget = typeof capability.invocationTarget === 'string' ?
    capability.invocationTarget : capability.invocationTarget.id;
  const documentLoader = extendContextLoader(async url => {
    if(url.startsWith('did:key:')) {
      return DOCUMENT_LOADER(url);
    }

    // dynamically generate zcap for root capability if applicable
    const zcap = await _generateRootCapability(url);
    if(zcap) {
      return {
        contextUrl: null,
        documentUrl: url,
        document: zcap
      };
    }

    // see if zcap is in storage
    try {
      const {authorization} = await brZCapStorage.authorizations.get(
        {id: url, invocationTarget});
      return {
        contextUrl: null,
        documentUrl: url,
        document: authorization.capability
      };
    } catch(e) {
      if(e.name !== 'NotFoundError') {
        throw e;
      }
    }

    return DOCUMENT_LOADER(url);
  });

  const {verified, error} = await jsigs.verify(capability, {
    suite: new Ed25519Signature2018(),
    purpose: new CapabilityDelegation({
      suite: new Ed25519Signature2018()
    }),
    documentLoader,
    compactProof: false
  });
  if(!verified) {
    throw error;
  }
}

async function _authorize({
  req, expectedTarget, expectedRootCapability, expectedAction
}) {
  // wrap document loader to always generate root zcap from config
  // description in storage
  const wrappedDocumentLoader = async url => {
    if(url.startsWith('did:key:')) {
      return DOCUMENT_LOADER(url);
    }

    // dynamically generate zcap for root capability if applicable
    const zcap = await _generateRootCapability(url);
    if(zcap) {
      return {
        contextUrl: null,
        documentUrl: url,
        document: zcap
      };
    }

    // see if zcap is in storage
    try {
      const {authorization} = await brZCapStorage.authorizations.get(
        {id: url, invocationTarget: expectedTarget});
      return {
        contextUrl: null,
        documentUrl: url,
        document: authorization.capability
      };
    } catch(e) {
      if(e.name !== 'NotFoundError') {
        throw e;
      }
    }

    return DOCUMENT_LOADER(url);
  };

  const url = `${config.server.baseUri}${req.originalUrl}`;
  const {method, headers} = req;
  const result = await verifyCapabilityInvocation({
    url, method, headers,
    getInvokedCapability,
    documentLoader: wrappedDocumentLoader,
    expectedHost: config.server.host,
    expectedTarget, expectedRootCapability, expectedAction,
    // TODO: support RsaSignature2018 and other suites?
    suite: [new Ed25519Signature2018()]
  });
  if(!result.verified) {
    throw new BedrockError(
      'Permission denied.', 'NotAllowedError', {
        httpStatusCode: 400,
        public: true
      }, result.error);
  }
  return {
    valid: result.verified,
    ...result
  };
}

async function getInvokedCapability({id, expectedTarget}) {
  // if the capability is a root zcap generated by this server then its
  // `id` will map to an invocation target; if so, dynamically generate the
  // zcap as it is the root authority which is automatically authorized
  const zcap = await _generateRootCapability(id);
  if(zcap) {
    return zcap;
  }

  // must get capability from authorizations storage
  try {
    const {authorization} = await brZCapStorage.authorizations.get({
      id,
      invocationTarget: expectedTarget
    });
    return authorization.capability;
  } catch(e) {
    if(e.name === 'NotFoundError') {
      throw new BedrockError(
        'Permission denied.', 'NotAllowedError', {
          httpStatusCode: 400,
          public: true
        }, e);
    }
    throw e;
  }
}

function _parsePublicKeyBase58(didKeyUrl) {
  const fingerprint = didKeyUrl.substr('did:key:'.length);
  // skip leading `z` that indicates base58 encoding
  const buffer = base58.decode(fingerprint.substr(1));
  // assume buffer is: 0xed 0x01 <public key bytes>
  return base58.encode(buffer.slice(2));
}

async function _generateRootCapability(url) {
  const result = _getInvocationTarget(url);
  if(!result) {
    return null;
  }
  const {target, edvId} = result;

  // dynamically generate zcap for root capability
  const {config} = await storage.getConfig({actor: null, id: edvId});
  return {
    '@context': SECURITY_CONTEXT_V2_URL,
    id: url,
    invocationTarget: target,
    controller: config.controller,
    invoker: config.invoker,
    delegator: config.delegator
  };
}

function _getInvocationTarget(url) {
  // look for `/edvs/<edvId>/zcaps/`
  const {baseUri} = config.server;
  const baseStorageUrl = `${baseUri}${routes.edvs}/`;
  let idx = url.indexOf(baseStorageUrl);
  if(idx !== 0) {
    return null;
  }

  // skip EDV ID
  const edvIdIdx = baseStorageUrl.length;
  idx = url.indexOf('/', edvIdIdx);
  if(idx === -1) {
    return null;
  }
  const edvId = `${baseStorageUrl}${url.substring(edvIdIdx, idx)}`;

  // skip `zcaps`
  idx = url.indexOf('zcaps/', idx + 1);
  if(idx === -1) {
    return null;
  }

  // valid root zcap invocation targets:
  // `/edvs/<edvId>/documents`
  // `/edvs/<edvId>/query`
  // `/edvs/<edvId>/authorizations`
  // root `/edvs/<edvId>/documents/...`
  const path = url.substr(idx + 6 /* 'zcaps/'.length */);
  if(!(['documents', 'query', 'authorizations'].includes(path) ||
    (path.startsWith('documents/') && path.length > 10))) {
    return null;
  }

  // return invocation target for the given root zcap URL
  return {
    target: `${edvId}/${path}`,
    edvId
  };
}

async function _generateRandom() {
  // 128-bit random number, multibase encoded
  // 0x00 = identity tag, 0x10 = length (16 bytes)
  const buf = Buffer.concat([
    Buffer.from([0x00, 0x10]),
    await getRandomBytes(16)
  ]);
  // multibase encoding for base58 starts with 'z'
  return 'z' + base58.encode(buf);
}

// TODO: move into JSON schema validator
function _assert128BitId(id) {
  try {
    // verify ID is multibase base58-encoded 16 bytes
    const buf = base58.decode(id.substr(1));
    // multibase base58 (starts with 'z')
    // 128-bit random number, multibase encoded
    // 0x00 = identity tag, 0x10 = length (16 bytes) + 16 random bytes
    if(!(id.startsWith('z') &&
      buf.length === 18 && buf[0] === 0x00 && buf[1] === 0x10)) {
      throw new Error('Invalid identifier.');
    }
  } catch(e) {
    throw new BedrockError(
      `Identifier "${id}" must be multibase, base58-encoded ` +
      'array of 16 random bytes.',
      'SyntaxError',
      {public: true, httpStatusCode: 400});
  }
}
