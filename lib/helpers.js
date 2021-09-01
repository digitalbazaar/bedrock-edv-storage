/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {authorizeZcapInvocation} = require('@digitalbazaar/ezcap-express');
const base58 = require('base58-universal');
const bedrock = require('bedrock');
const brZCapStorage = require('bedrock-zcap-storage');
const {config, util: {BedrockError}} = bedrock;
const crypto = require('crypto');
const {documentLoader} = require('./documentLoader');
const edvs = require('./storage/edvs.js');
const logger = require('./logger');
const {meters} = require('bedrock-meter-usage-reporter');
const {promisify} = require('util');
const getRandomBytes = promisify(crypto.randomBytes);

exports.SERVICE_TYPE = 'edv';

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

exports.authorizeDocZcapInvocation = () => {
  // authz for doc endpoints
  return exports.authorizeZcapInvocation({
    getExpectedTarget: _getExpectedDocTarget,
    onError: exports.onError
  });
};

exports.authorizeZcapInvocation = ({
  getExpectedTarget, getRootController = exports.getRootController,
  expectedAction, getExpectedAction, onError
} = {}) => {
  return authorizeZcapInvocation({
    expectedHost: config.server.host,
    getRootController,
    documentLoader,
    getExpectedTarget,
    expectedAction,
    getExpectedAction,
    inspectCapabilityChain: exports.inspectCapabilityChain,
    onError,
  });
};

exports.getEdvId = ({localId} = {}) => {
  exports.assert128BitId(localId);
  const {baseUri} = config.server;
  const baseStorageUrl = `${baseUri}${config['edv-storage'].routes.basePath}`;
  return `${baseStorageUrl}/${localId}`;
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

exports.getRoutes = () => {
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

  return routes;
};

exports.getRootController = async ({
  req, rootCapabilityId, rootInvocationTarget
}) => {
  const edvBaseUrl = req.protocol + '://' + req.get('host') +
    config['edv-storage'].routes.basePath;

  // get controller for the entire EDV service
  if(rootInvocationTarget === edvBaseUrl) {
    throw new Error(`Invalid root invocation target "${edvBaseUrl}".`);
  }

  // get controller for an individual EDV
  let controller;
  try {
    const record = await edvs.get({id: rootInvocationTarget, req});
    ({config: {controller}} = record);
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
};

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

exports.onError = ({error}) => {
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
};

exports.reportOperationUsageWithoutWaiting = ({edvId}) => {
  // do not await
  _reportOperationUsage({edvId}).catch();
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

async function _getExpectedDocTarget({req}) {
  // expected target is the EDV itself, `/documents`, or
  // `/documents/<docId>`
  const edvId = exports.getEdvId({localId: req.params.edvId});
  return {
    expectedTarget: [
      edvId, `${edvId}/documents`,
      `${edvId}/documents/${req.params.docId}`
    ]
  };
}

async function _reportOperationUsage({edvId}) {
  let meterId;
  try {
    const {config} = await edvs.get({id: edvId});
    meterId = config.meterId;
    await meters.use({id: meterId, operations: 1});
  } catch(error) {
    let message = 'Meter ';
    if(meterId) {
      message += `(${meterId}) `;
    }
    message += `usage error for EDV "${edvId}".`;
    logger.error(message, {error});
  }
}
