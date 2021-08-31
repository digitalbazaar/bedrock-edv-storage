/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const base58 = require('base58-universal');
const bedrock = require('bedrock');
const brZCapStorage = require('bedrock-zcap-storage');
const {config, util: {BedrockError}} = bedrock;
const {promisify} = require('util');
const crypto = require('crypto');
const {documentLoader} = require('bedrock-jsonld-document-loader');
const getRandomBytes = promisify(crypto.randomBytes);
const jsigs = require('jsonld-signatures');
const {extendContextLoader} = jsigs;
const {Ed25519Signature2020} = require('@digitalbazaar/ed25519-signature-2020');
//const storage = require('./storage');
const {verifyCapabilityInvocation} = require('http-signature-zcap-verify');
const {CapabilityDelegation, constants: {ZCAP_CONTEXT_URL}} =
  require('@digitalbazaar/zcapld');
const {didIo} = require('bedrock-did-io');
const {verifyHeaderValue} = require('@digitalbazaar/http-digest-header');

const routes = {
  edvs: '/edvs',
};

exports.getEdvId = ({localId} = {}) => {
  exports.assert128BitId(localId);
  const {baseUri} = config.server;
  const baseStorageUrl = `${baseUri}${routes.edvs}`;
  return `${baseStorageUrl}/${localId}`;
};

exports.assert128BitId = id => {
  try {
    // verify ID is base58-encoded multibase multicodec encoded 16 bytes
    const buf = base58.decode(id.substr(1));
    // multibase base58 (starts with 'z')
    // 128-bit random number, multicodec encoded
    // 0x00 = identity tag, 0x10 = length (16 bytes) + 16 random bytes
    if(!(id.startsWith('z') &&
      buf.length === 18 && buf[0] === 0x00 && buf[1] === 0x10)) {
      throw new Error('Invalid identifier.');
    }
  } catch(e) {
    throw new BedrockError(
      `Identifier "${id}" must be base58-encoded multibase, ` +
      'multicodec array of 16 random bytes.',
      'SyntaxError',
      {public: true, httpStatusCode: 400});
  }
};

exports.inspectCapabilityChain = async ({
  capabilityChain, capabilityChainMeta
}) => {
  // collect the capability IDs and delegators for the capabilities in the chain
  const capabilities = [];
  for(const [i, capability] of capabilityChain.entries()) {
    const [{purposeResult}] = capabilityChainMeta[i].verifyResult.results;
    if(purposeResult && purposeResult.delegator) {
      capabilities.push({
        capabilityId: capability.id,
        delegator: purposeResult.delegator.id,
      });
    }
  }
  const revoked = await brZCapStorage.revocations.isRevoked({capabilities});

  if(revoked) {
    return {
      valid: false,
      error: new Error(
        'One or more capabilities in the chain have been revoked.')
    };
  }

  return {valid: true};
};

// exports.authorize = async ({
//   req, expectedTarget, expectedRootCapability, expectedController,
//   expectedAction
// }) => {
//   const url = `${bedrock.config.server.baseUri}${req.originalUrl}`;
//   const {method, headers} = req;
//   const result = await verifyCapabilityInvocation({
//     url, method, headers,
//     getInvokedCapability: _createGetInvokedCapability({expectedController}),
//     documentLoader: _createWrappedDocumentLoader(
//       {expectedController, expectedTarget}),
//     expectedHost: config.server.host,
//     expectedTarget, expectedRootCapability, expectedAction,
//     inspectCapabilityChain: exports.inspectCapabilityChain,
//     suite: [new Ed25519Signature2020()],
//     allowTargetAttenuation: true,
//   });
//   if(!result.verified) {
//     throw new BedrockError(
//       'Permission denied.', 'NotAllowedError', {
//         httpStatusCode: 400,
//         public: true
//       }, result.error);
//   }
//   return {
//     valid: result.verified,
//     ...result
//   };
// };

// exports.getInvocationTarget = url => {
//   const baseStorageUrl = `${bedrock.config.server.baseUri}${routes.edvs}/`;
//   // look for `/edvs/<edvId>/zcaps/`
//   let idx = url.indexOf(baseStorageUrl);
//   if(idx !== 0) {
//     return null;
//   }

//   // skip EDV ID
//   const edvIdIdx = baseStorageUrl.length;
//   idx = url.indexOf('/', edvIdIdx);
//   if(idx === -1) {
//     return null;
//   }
//   const edvId = `${baseStorageUrl}${url.substring(edvIdIdx, idx)}`;

//   // skip `zcaps`
//   idx = url.indexOf('zcaps/', idx + 1);
//   if(idx === -1) {
//     return null;
//   }

//   // valid root zcap invocation targets:
//   // `/edvs/<edvId>/documents`
//   // `/edvs/<edvId>/query`
//   // `/edvs/<edvId>/authorizations`
//   // root `/edvs/<edvId>/documents/...`
//   const path = url.substr(idx + 6 /* 'zcaps/'.length */);
//   if(!(['documents', 'query', 'authorizations', 'revocations'].includes(path) ||
//     (path.startsWith('documents/') && path.length > 10))) {
//     return null;
//   }

//   // return invocation target for the given root zcap URL
//   return {
//     target: `${edvId}/${path}`,
//     edvId
//   };
// };

// exports.generateRootCapability = async ({expectedController, url}) => {
//   const baseStorageUrl = `${bedrock.config.server.baseUri}${routes.edvs}/`;
//   // this is a new config
//   if(url === `${baseStorageUrl}zcaps/configs` && expectedController) {
//     return {
//       '@context': ZCAP_CONTEXT_URL,
//       id: url,
//       // baseStorageUrl has a trailing slash which does not work here
//       invocationTarget: `${bedrock.config.server.baseUri}${routes.edvs}`,
//       controller: expectedController,
//     };
//   }

//   const result = exports.getInvocationTarget(url);
//   if(!result) {
//     return null;
//   }
//   const {target, edvId} = result;

//   // dynamically generate zcap for root capability
//   const {config} = await storage.getConfig({actor: null, id: edvId});
//   return {
//     '@context': ZCAP_CONTEXT_URL,
//     id: url,
//     invocationTarget: target,
//     controller: config.controller,
//     invoker: config.invoker,
//     delegator: config.delegator
//   };
// };

// exports.inspectCapabilityChain = async ({
//   capabilityChain, capabilityChainMeta
// }) => {
//   // collect the capability IDs and delegators for the capabilities in the chain
//   const capabilities = [];
//   for(const [i, capability] of capabilityChain.entries()) {
//     const [{purposeResult}] = capabilityChainMeta[i].verifyResult.results;
//     if(purposeResult && purposeResult.delegator) {
//       capabilities.push({
//         capabilityId: capability.id,
//         delegator: purposeResult.delegator.id,
//       });
//     }
//   }
//   const revoked = await brZCapStorage.revocations.isRevoked({capabilities});

//   if(revoked) {
//     return {
//       valid: false,
//       error: new Error(
//         'One or more capabilities in the chain have been revoked.')
//     };
//   }

//   return {valid: true};
// };

exports.generateRandom = async () => {
  // 128-bit random number, multibase encoded
  // 0x00 = identity tag, 0x10 = length (16 bytes)
  const buf = Buffer.concat([
    Buffer.from([0x00, 0x10]),
    await getRandomBytes(16)
  ]);
  // multibase encoding for base58 starts with 'z'
  return `z${base58.encode(buf)}`;
};

exports.validateDocSequence = sequence => {
  // doc.sequence is limited to MAX_SAFE_INTEGER - 1 to avoid unexpected
  // behavior when a client attempts to increment the sequence number.
  if(!Number.isSafeInteger(sequence) ||
    !(sequence < Number.MAX_SAFE_INTEGER)) {
    throw new TypeError('"doc.sequence" number is too large.');
  }
  // Note: `doc.sequence === 0` is intentionally not enforced at this time
  // to allow for easier copying of documents from other EDVs, this
  // may change in the future
  if(sequence < 0) {
    throw new TypeError('"doc.sequence" must be a non-negative integer.');
  }
};

// exports.verifyDelegation = async ({capability, edvId}) => {
//   const invocationTarget = typeof capability.invocationTarget === 'string' ?
//     capability.invocationTarget : capability.invocationTarget.id;
//   const documentLoader = extendContextLoader(async url => {
//     if(url.startsWith('did:key:')) {
//       return _documentLoader(url);
//     }

//     // dynamically generate zcap for root capability if applicable
//     const zcap = await exports.generateRootCapability({url});
//     if(zcap) {
//       return {
//         contextUrl: null,
//         documentUrl: url,
//         document: zcap
//       };
//     }

//     // see if zcap is in storage
//     try {
//       const {authorization} = await brZCapStorage.authorizations.get(
//         {id: url, invocationTarget});
//       return {
//         contextUrl: null,
//         documentUrl: url,
//         document: authorization.capability
//       };
//     } catch(e) {
//       if(e.name !== 'NotFoundError') {
//         throw e;
//       }
//     }

//     return _documentLoader(url);
//   });
//   const expectedRootCapability = _getExpectedRootCapability(
//     {invocationTarget, edvId});
//   const {verified, error} = await jsigs.verify(capability, {
//     suite: new Ed25519Signature2020(),
//     purpose: new CapabilityDelegation({
//       expectedRootCapability,
//       suite: new Ed25519Signature2020()
//     }),
//     documentLoader,
//     compactProof: false
//   });
//   if(!verified) {
//     throw error;
//   }
// };

// exports.verifyDigestHeaderValue = async (req, res, next) => {
//   const expectedDigest = req.headers.digest;
//   const {verified} = await verifyHeaderValue({
//     data: req.body, headerValue: expectedDigest});
//   if(!verified) {
//     next(new BedrockError(
//       'Header digest value does not match digest of body.', 'DataError', {
//         httpStatusCode: 400,
//         public: true
//       }));
//   } else {
//     next();
//   }
// };

// function _createGetInvokedCapability({expectedController}) {
//   return async ({id, expectedTarget}) => {
//     // if the capability is a root zcap generated by this server then its
//     // `id` will map to an invocation target; if so, dynamically generate the
//     // zcap as it is the root authority which is automatically authorized
//     const zcap = await exports.generateRootCapability(
//       {expectedController, url: id});
//     if(zcap) {
//       return zcap;
//     }

//     // must get capability from authorizations storage
//     try {
//       const {authorization} = await brZCapStorage.authorizations.get({
//         id,
//         invocationTarget: expectedTarget
//       });
//       return authorization.capability;
//     } catch(e) {
//       if(e.name === 'NotFoundError') {
//         throw new BedrockError(
//           'Permission denied.', 'NotAllowedError', {
//             httpStatusCode: 400,
//             public: true
//           }, e);
//       }
//       throw e;
//     }
//   };
// }

// /**
// * Gets an `expectedRootCapability` from an `invocationTarget`. This function
// * handles special cases where the `invocationTarget` does not match the
// * `expectedRootCapability` because the `invocationTarget` cannot be expressed
// * as a zcap.
// *
// * @param {object} options - Options to use.
// * @param {string} options.invocationTarget - An invocationTarget.
// * @param {string} options.edvId - The edvId (URL to the EDV).
// *
// * @return {string} The `expectedRootCapability` for the `invocationTarget`.
//  */
// function _getExpectedRootCapability({invocationTarget, edvId}) {
//   // `authorizations` endpoint cannot be expressed as a zcap, map to zcap space
//   if(invocationTarget === `${edvId}/authorizations`) {
//     return `${edvId}/zcaps/authorizations`;
//   }
//   // `documents` endpoint cannot be expressed as a zcap, map to zcap space
//   if(invocationTarget === `${edvId}/documents`) {
//     return `${edvId}/zcaps/documents`;
//   }
//   // a specific document cannot be expressed as a zcap, map to zcap space
//   // and allow root zcap to be entire collection or just the document
//   if(invocationTarget.startsWith(`${edvId}/documents/`)) {
//     const docPath = invocationTarget.substr(`${edvId}/documents/`.length);
//     return [
//       `${edvId}/zcaps/documents/${docPath}`,
//       `${edvId}/zcaps/documents`
//     ];
//   }
//   // query endpoint can't be expressed as zcap, map to zcap space and allow
//   // documents endpoint as a root zcap for queries as well
//   if(invocationTarget === `${edvId}/query`) {
//     return [
//       `${edvId}/zcaps/query`,
//       `${edvId}/zcaps/documents`
//     ];
//   }
//   // otherwise use default behavior of `invocationTarget` matches root zcap
//   return invocationTarget;
// }

// // Note: for dereferencing `did:` URLs
// async function _documentLoader(url) {
//   let document;
//   if(url.startsWith('did:')) {
//     document = await didIo.get({did: url, forceConstruct: true});
//     return {
//       contextUrl: null,
//       documentUrl: url,
//       document
//     };
//   }

//   // finally, try the bedrock document loader
//   return documentLoader(url);
// }

// // wrap document loader to always generate root zcap from config
// // description in storage
// function _createWrappedDocumentLoader({expectedController, expectedTarget}) {
//   return async url => {
//     if(url.startsWith('did:key:')) {
//       return _documentLoader(url);
//     }

//     // dynamically generate zcap for root capability if applicable
//     const zcap = await exports.generateRootCapability(
//       {expectedController, url});
//     if(zcap) {
//       return {
//         contextUrl: null,
//         documentUrl: url,
//         document: zcap
//       };
//     }

//     // see if zcap is in storage
//     try {
//       const {authorization} = await brZCapStorage.authorizations.get(
//         {id: url, invocationTarget: expectedTarget});
//       return {
//         contextUrl: null,
//         documentUrl: url,
//         document: authorization.capability
//       };
//     } catch(e) {
//       if(e.name !== 'NotFoundError') {
//         throw e;
//       }
//     }

//     return _documentLoader(url);
//   };
// }
