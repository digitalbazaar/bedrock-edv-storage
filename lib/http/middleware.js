/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as brZCapStorage from '@bedrock/zcap-storage';
import * as edvs from '../storage/edvs.js';
import {asyncHandler} from '@bedrock/express';
import {default as _cors} from 'cors';
import {documentLoader} from '../documentLoader.js';
import {getEdvId, verifyRequestIp} from '../helpers.js';
import {
  authorizeZcapInvocation as _authorizeZcapInvocation,
  authorizeZcapRevocation as _authorizeZcapRevocation
} from '@digitalbazaar/ezcap-express';
import {CryptoLD} from 'crypto-ld';
import {Ed25519Signature2020} from '@digitalbazaar/ed25519-signature-2020';
import {
  Ed25519VerificationKey2020
} from '@digitalbazaar/ed25519-verification-key-2020';

const {config, util: {BedrockError}} = bedrock;

// create `getVerifier` hook for verifying zcap invocation HTTP signatures
const cryptoLd = new CryptoLD();
cryptoLd.use(Ed25519VerificationKey2020);

// gets the EDV config for the current request and caches it in
// `req.edv.config`
export const getEdvConfig = asyncHandler(_getEdvConfig);

// calls ezcap-express's authorizeZcapInvocation w/constant params, exposing
// only those params that change in this module
export function authorizeZcapInvocation({
  getExpectedValues, getRootController
}) {
  const {authorizeZcapInvocationOptions} = bedrock.config['edv-storage'];
  return _authorizeZcapInvocation({
    documentLoader, getExpectedValues, getRootController,
    getVerifier,
    inspectCapabilityChain,
    onError,
    suiteFactory,
    ...authorizeZcapInvocationOptions
  });
}

// creates middleware for EDV route authz checks
export function authorizeEdvZcapInvocation({expectedAction} = {}) {
  return authorizeZcapInvocation({
    async getExpectedValues({req}) {
      return {
        // allow expected action override
        action: expectedAction,
        host: config.server.host,
        rootInvocationTarget: req.edv.config.id
      };
    },
    async getRootController({req}) {
      // this will always be present based on where this middleware is used
      return req.edv.config.controller;
    }
  });
}

// creates middleware for revocation of zcaps for EDVs
export function authorizeZcapRevocation() {
  return _authorizeZcapRevocation({
    documentLoader,
    expectedHost: config.server.host,
    async getRootController({req}) {
      // this will always be present based on where this middleware is used
      return req.edv.config.controller;
    },
    getVerifier,
    inspectCapabilityChain,
    onError,
    suiteFactory
  });
}

export function cors() {
  // `86400` is the max acceptable cache age for modern browsers
  return _cors({maxAge: 86400});
}

// hook used to verify zcap invocation HTTP signatures
async function getVerifier({keyId, documentLoader}) {
  const key = await cryptoLd.fromKeyId({id: keyId, documentLoader});
  const verificationMethod = await key.export(
    {publicKey: true, includeContext: true});
  const verifier = key.verifier();
  return {verifier, verificationMethod};
}

async function inspectCapabilityChain({
  capabilityChain, capabilityChainMeta
}) {
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
}

function onError({error}) {
  if(!(error instanceof BedrockError)) {
    // always expose cause message and name; expose cause details as
    // BedrockError if error is marked public
    let details = {};
    if(error.details && error.details.public) {
      details = error.details;
    }
    error = new BedrockError(
      error.message,
      error.name || 'NotAllowedError', {
        ...details,
        public: true,
      }, error);
  }
  throw new BedrockError(
    'Authorization error.', 'NotAllowedError', {
      httpStatusCode: 403,
      public: true,
    }, error);
}

// hook used to create suites for verifying zcap delegation chains
async function suiteFactory() {
  return new Ed25519Signature2020();
}

async function _getEdvConfig(req, res, next) {
  if(!req.edv) {
    const edvId = getEdvId({localId: req.params.edvId});
    const {config} = await edvs.get({id: edvId, req});

    // verify that request is from an IP that is allowed to access the config
    const {verified} = verifyRequestIp({edvConfig: config, req});
    if(!verified) {
      throw new BedrockError(
        'Permission denied. Source IP is not allowed.', 'NotAllowedError', {
          httpStatusCode: 403,
          public: true,
        });
    }

    req.edv = {config};
  }
  next();
}
