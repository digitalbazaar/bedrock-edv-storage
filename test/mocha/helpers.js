/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
const base58 = require('base58-universal');
const crypto = require('crypto');
const database = require('bedrock-mongodb');
const {promisify} = require('util');
const {util: {uuid}} = bedrock;
const {EdvClient} = require('edv-client');
const didKeyDriver = require('@digitalbazaar/did-method-key').driver();
const {sign} = require('jsonld-signatures');
const {KeystoreAgent, KmsClient, CapabilityAgent} =
  require('@digitalbazaar/webkms-client');
const {CapabilityDelegation, constants: {ZCAP_CONTEXT_URL}} =
  require('@digitalbazaar/zcapld');
const {Ed25519Signature2020} = require('@digitalbazaar/ed25519-signature-2020');
const {Ed25519VerificationKey2020} =
  require('@digitalbazaar/ed25519-verification-key-2020');
const {Cipher} = require('@digitalbazaar/minimal-cipher');
const {ReadableStream} = require('web-streams-polyfill/ponyfill');
const {httpClient} = require('@digitalbazaar/http-client');
const {httpsAgent} = require('bedrock-https-agent');
const mockData = require('./mock.data');

const cipher = new Cipher();
const _chunkSize = 1048576;

const getRandomBytes = promisify(crypto.randomBytes);

// for key generation
exports.KMS_MODULE = 'ssm-v1';
// algorithm required for the jwe headers
exports.JWE_ALG = 'ECDH-ES+A256KW';

// creates a unit8 array of variable size
// that can be used as stream data
exports.getRandomUint8 = ({size = 50} = {}) => {
  return new Uint8Array(size).map(
    // 255 is the max value of a Unit8
    () => Math.floor(Math.random() * 255));
};

/* eslint-disable-next-line max-len */
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
function getRandomIntInclusive(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  // The maximum is inclusive and the minimum is inclusive
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// test various sequence numbers at edge case zones
exports.sequenceNumberTests = [
  // low values
  ['0', 0],
  ['1', 1],
  // near INT32_MAX
  ['2**31-1', 2 ** 31 - 1],
  ['2**31', 2 ** 31],
  ['2**31+1', 2 ** 31 + 1],
  // near UINT32_MAX
  ['2**32-1', 2 ** 32 - 1],
  ['2**32', 2 ** 32],
  ['2**32+1', 2 ** 32 + 1],
  // in range [UINT32_MAX + 1, Number.MAX_SAFE_INTEGER]
  ['in range [2**32, MAX_SAFE_INTEGER] (middle)',
    2 ** 32 + (Number.MAX_SAFE_INTEGER - 2 ** 32 - 1) / 2],
  ['in range [2**32, MAX_SAFE_INTEGER] (random)',
    getRandomIntInclusive(2 ** 32, Number.MAX_SAFE_INTEGER - 1)],
  // near Number.MAX_SAFE_INTEGER
  ['MAX_SAFE_INTEGER-2', Number.MAX_SAFE_INTEGER - 2]
].map(d => ({
  title: `should insert a document with sequence number ${d[0]}`,
  updateTitle: `should update a document with sequence number ${d[0]}`,
  sequence: d[1]
}));

exports.parseLocalId = ({id}) => {
  // format: <base>/<localId>
  const idx = id.lastIndexOf('/');
  const localId = id.substr(idx + 1);
  return {
    base: id.substring(0, idx),
    // convert to `Buffer` for storage savings (`z<base58-encoded ID>`)
    // where the ID is multicodec encoded 16 byte random value
    // 0x00 = identity tag, 0x10 = length (16 bytes) header
    localId: Buffer.from(base58.decode(localId.slice(1)).slice(2))
  };
};

exports.generateRandom = async () => {
  // 128-bit random number, multibase encoded
  // 0x00 = identity tag, 0x10 = length (16 bytes)
  const buf = Buffer.concat([
    Buffer.from([0x00, 0x10]),
    await getRandomBytes(16)
  ]);
  // multibase encoding for base58 starts with 'z'
  return 'z' + base58.encode(buf);
};

exports.makeDelegationTesters = async ({testers = []}) => {
  const testData = {};
  for(const tester of testers) {
    const testerData = testData[tester] = {
      secret: uuid(),
      handle: `${tester}Key`,
    };
    testerData.capabilityAgent = await CapabilityAgent.fromSecret({
      secret: testerData.secret,
      handle: testerData.handle
    });
    const keystoreAgent = testerData.keystoreAgent =
      await exports.createKeystore({
        capabilityAgent: testerData.capabilityAgent
      });
    testerData.keyAgreementKey = await keystoreAgent.generateKey(
      {type: 'keyAgreement'});
    testerData.verificationKey = await keystoreAgent.generateKey(
      {type: 'asymmetric'});
    testerData.hmac = await keystoreAgent.generateKey(
      {type: 'hmac'});
  }
  return testData;
};

exports.prepareDatabase = async () => {
  await exports.removeCollections();
};

exports.removeCollections = async (
  collectionNames = [
    'edvConfig',
    'edvDoc',
    'edvDocChunk'
  ]) => {
  await database.openCollections(collectionNames);
  for(const collectionName of collectionNames) {
    await database.collections[collectionName].removeMany({});
  }
};

exports.removeCollection =
  async collectionName => exports.removeCollections([collectionName]);

exports.createMeter = async ({capabilityAgent, serviceType} = {}) => {
  if(!(serviceType && typeof serviceType === 'string')) {
    throw new TypeError('"serviceType" must be a string.');
  }

  // create a meter
  const meterService = `${bedrock.config.server.baseUri}/meters`;
  let meter = {
    controller: capabilityAgent.id,
    product: {
      id: mockData.productIdMap.get(serviceType)
    }
  };

  const response = await httpClient.post(meterService, {
    agent: httpsAgent, json: meter
  });
  ({data: {meter}} = response);

  const {id} = meter;
  return {id: `${meterService}/${id}`};
};

// the `keystores` endpoint uses session based authentication which is
// mocked
exports.createKeystore = async ({
  capabilityAgent, ipAllowList, referenceId, meterId,
  kmsBaseUrl = `${bedrock.config.server.baseUri}/kms`,
  kmsModule = 'ssm-v1',
}) => {
  if(!meterId) {
    // create a meter for the keystore
    ({id: meterId} = await exports.createMeter({
      capabilityAgent, serviceType: 'webkms'
    }));
  }

  // create keystore
  const config = {
    sequence: 0,
    controller: capabilityAgent.id,
    meterId,
    kmsModule
  };
  if(referenceId) {
    config.referenceId = referenceId;
  }
  if(ipAllowList) {
    config.ipAllowList = ipAllowList;
  }

  const {id: keystoreId} = await KmsClient.createKeystore({
    url: `${kmsBaseUrl}/keystores`,
    config,
    invocationSigner: capabilityAgent.getSigner(),
    httpsAgent
  });
  const kmsClient = new KmsClient({httpsAgent});
  return new KeystoreAgent({capabilityAgent, keystoreId, kmsClient});
};

exports.createEdv = async ({
  capabilityAgent, keystoreAgent, urls,
  keyAgreementKey, hmac, referenceId, meterId
}) => {
  if(!meterId) {
    // create a meter for the keystore
    ({id: meterId} = await exports.createMeter({
      capabilityAgent, serviceType: 'edv'
    }));
  }

  if(!(keyAgreementKey && hmac) && keystoreAgent) {
    // create KAK and HMAC keys for edv config
    ([keyAgreementKey, hmac] = await Promise.all([
      keystoreAgent.generateKey({type: 'keyAgreement'}),
      keystoreAgent.generateKey({type: 'hmac'})
    ]));
  }

  // create edv
  const newEdvConfig = {
    sequence: 0,
    controller: capabilityAgent.id,
    keyAgreementKey: {id: keyAgreementKey.id, type: keyAgreementKey.type},
    hmac: {id: hmac.id, type: hmac.type},
    meterId
  };

  if(referenceId) {
    newEdvConfig.referenceId = referenceId;
  }

  const edvConfig = await EdvClient.createEdv({
    config: newEdvConfig,
    httpsAgent,
    invocationSigner: capabilityAgent.getSigner(),
    url: urls.edvs,
  });

  const edvClient = new EdvClient({
    id: edvConfig.id,
    keyResolver: _keyResolver,
    keyAgreementKey,
    hmac,
    httpsAgent
  });

  return {edvClient, edvConfig};
};

// FIXME: make more restrictive, support `did:key` and `did:v1`
async function _keyResolver({id}) {
  if(id.startsWith('did:key:')) {
    return didKeyDriver.get({url: id});
  }
  const response = await httpClient.get(id, {agent: httpsAgent});
  return response.data;
}
exports.keyResolver = _keyResolver;

/**
 * Delegates a zCap.
 *
 * @param {object} options - Options to use.
 * @param {object} options.zcap - A valid zCap with another user
 *   as the invoker and delegator.
 * @param {object} options.signer - A capabilityAgent.getSigner()
 *   from the someone higher in the capabilityChain than the invoker.
 * @param {Array<string>} options.capabilityChain = An array of ids
 *   that must start with the rootCapability first.
 *
 * @returns {Promise<object>} A signed zCap with a Linked Data Proof.
 */
exports.delegate = async ({zcap, signer, capabilityChain, documentLoader}) => {
  if(!zcap['@context']) {
    zcap['@context'] = ZCAP_CONTEXT_URL;
  }
  if(!zcap.id) {
    zcap.id = `urn:zcap:${uuid()}`;
  }
  let Suite = null;
  if(/^Ed25519/i.test(signer.type)) {
    Suite = Ed25519Signature2020;
  }
  if(!Suite) {
    throw new Error(`Unsupported key type ${signer.type}`);
  }
  // attach capability delegation proof
  return sign(zcap, {
    // TODO: map `signer.type` to signature suite
    suite: new Suite({
      signer
    }),
    purpose: new CapabilityDelegation({capabilityChain}),
    documentLoader
  });
};

exports.setKeyId = async key => {
  // the keyDescription is required to get publicKeyBase58
  const keyDescription = await key.getKeyDescription();
  // create public ID (did:key) for bob's key
  // TODO: do not use did:key but support a did:v1 based key.
  const fingerprint = (await Ed25519VerificationKey2020.from(keyDescription))
    .fingerprint();
  // invocationTarget.verificationMethod = `did:key:${fingerprint}`;
  key.id = `did:key:${fingerprint}#${fingerprint}`;
};

exports.createEncryptStream = async ({
  data,
  recipients,
  chunkSize = _chunkSize
}) => {
  const stream = new ReadableStream({
    pull(controller) {
      controller.enqueue(data);
      controller.close();
    }
  });
  const encryptStream = await cipher.createEncryptStream(
    {recipients, keyResolver: _keyResolver, chunkSize});
  // pipe user supplied `stream` through the encrypt stream
  //const readable = forStorage.pipeThrough(encryptStream);
  const readable = stream.pipeThrough(encryptStream);
  return readable.getReader();
};

exports.decryptStream = async ({chunks, keyAgreementKey}) => {
  const stream = new ReadableStream({
    pull(controller) {
      chunks.forEach(c => controller.enqueue(c));
      controller.close();
    }
  });
  const decryptStream = await cipher.createDecryptStream(
    {keyAgreementKey});
  const readable = stream.pipeThrough(decryptStream);
  const reader = readable.getReader();
  let data = new Uint8Array(0);
  let value;
  let done = false;
  while(!done) {
    try {
      ({value, done} = await reader.read());
      if(!done) {
        // create a new array with the new length
        const next = new Uint8Array(data.length + value.length);
        // set the first values to the existing chunk
        next.set(data);
        // set the chunk's values to the rest of the array
        next.set(value, data.length);
        // update the streamData
        data = next;
      }
    } catch(e) {
      console.error(e);
      throw e;
    }
  }
  return Uint8Array.from(data);
};
