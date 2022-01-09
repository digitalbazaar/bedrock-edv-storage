/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {
  authorizeZcapInvocation, authorizeZcapRevocation
} = require('@digitalbazaar/ezcap-express');
const bedrock = require('bedrock');
const brZCapStorage = require('bedrock-zcap-storage');
const {config, util: {BedrockError}} = bedrock;
const {documentLoader} = require('../documentLoader');
const edvs = require('../storage/edvs.js');
const {Ed25519Signature2020} = require('@digitalbazaar/ed25519-signature-2020');
const {getEdvId} = require('../helpers');

exports.authorizeDocZcapInvocation = () => {
  // authz for doc endpoints
  return exports.authorizeZcapInvocation({
    getExpectedTarget: _getExpectedDocTarget
  });
};

exports.authorizeZcapInvocation = ({
  getExpectedTarget, getRootController = exports.getRootController,
  expectedAction, getExpectedAction, onError = exports.onError
} = {}) => {
  return authorizeZcapInvocation({
    expectedHost: config.server.host,
    getRootController,
    documentLoader,
    getExpectedTarget,
    expectedAction,
    getExpectedAction,
    inspectCapabilityChain: exports.inspectCapabilityChain,
    onError
  });
};

exports.authorizeZcapRevocation = () => {
  return authorizeZcapRevocation({
    expectedHost: config.server.host,
    getRootController: exports.getRootController,
    documentLoader,
    async getExpectedTarget({req}) {
      const edvId = getEdvId({localId: req.params.edvId});
      // ensure EDV can be retrieved
      await edvs.get({id: edvId, req});
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
    inspectCapabilityChain: exports.inspectCapabilityChain,
    onError: exports.onError
  });
};

exports.inspectCapabilityChain = async ({
  capabilityChain, capabilityChainMeta
}) => {
  // if capability chain has only root, there's nothing to check as root
  // zcaps cannot be revoked
  if(capabilityChain.length === 1) {
    return {valid: true};
  }

  // collect capability IDs and delegators for all delegated capabilities in
  // chain (skip root) so they can be checked for revocation
  const capabilities = [];
  for(const [i, capability] of capabilityChain.entries()) {
    // skip root zcap, it cannot be revoked
    if(i === 0) {
      continue;
    }
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

async function _getExpectedDocTarget({req}) {
  // expected target is the EDV itself, `/documents`, or
  // `/documents/<docId>`
  const edvId = getEdvId({localId: req.params.edvId});
  return {
    expectedTarget: [
      edvId, `${edvId}/documents`,
      `${edvId}/documents/${req.params.docId}`
    ]
  };
}
