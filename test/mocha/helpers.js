/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as database from '@bedrock/mongodb';
import crypto from 'node:crypto';
import {getAppIdentity} from '@bedrock/app-identity';
import {httpClient} from '@digitalbazaar/http-client';
import {httpsAgent} from '@bedrock/https-agent';
import {promisify} from 'node:util';
import jsigs from 'jsonld-signatures';
import {mockData} from './mock.data.js';
import {v4 as uuid} from 'uuid';
import * as base58 from 'base58-universal';
import {EdvClient} from '@digitalbazaar/edv-client';
import {driver as _didKeyDriver} from '@digitalbazaar/did-method-key';
import {
  KeystoreAgent, KmsClient, CapabilityAgent
} from '@digitalbazaar/webkms-client';
import {
  CapabilityDelegation, constants as zcapConstants
} from '@digitalbazaar/zcap';
import {Ed25519Signature2020} from '@digitalbazaar/ed25519-signature-2020';
import {
  Ed25519VerificationKey2020
} from '@digitalbazaar/ed25519-verification-key-2020';
import {Cipher} from '@digitalbazaar/minimal-cipher';
import {ZcapClient} from '@digitalbazaar/ezcap';

const {sign} = jsigs;

const didKeyDriver = _didKeyDriver();
const {ZCAP_CONTEXT_URL} = zcapConstants;

const cipher = new Cipher();
const _chunkSize = 1048576;

const getRandomBytes = promisify(crypto.randomBytes);

// for key generation
export const KMS_MODULE = 'ssm-v1';
// algorithm required for the jwe headers
export const JWE_ALG = 'ECDH-ES+A256KW';

// creates a unit8 array of variable size
// that can be used as stream data
export function getRandomUint8({size = 50} = {}) {
  return new Uint8Array(size).map(
    // 255 is the max value of a Unit8
    () => Math.floor(Math.random() * 255));
}

/* eslint-disable-next-line max-len */
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
function getRandomIntInclusive(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  // The maximum is inclusive and the minimum is inclusive
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// test various sequence numbers at edge case zones
export const sequenceNumberTests = [
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

export function parseLocalId({id}) {
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
}

export async function generateRandom() {
  // 128-bit random number, multibase encoded
  // 0x00 = identity tag, 0x10 = length (16 bytes)
  const buf = Buffer.concat([
    Buffer.from([0x00, 0x10]),
    await getRandomBytes(16)
  ]);
  // multibase encoding for base58 starts with 'z'
  return 'z' + base58.encode(buf);
}

export async function makeDelegationTesters({testers = []}) {
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
      await createKeystore({capabilityAgent: testerData.capabilityAgent});
    testerData.keyAgreementKey = await keystoreAgent.generateKey(
      {type: 'keyAgreement'});
    testerData.verificationKey = await keystoreAgent.generateKey(
      {type: 'asymmetric'});
    testerData.hmac = await keystoreAgent.generateKey(
      {type: 'hmac'});
  }
  return testData;
}

export async function prepareDatabase() {
  await removeCollections();
}

export async function removeCollections(
  collectionNames = [
    'edv-storage-config',
    'edv-storage-doc',
    'edv-storage-chunk'
  ]) {
  await database.openCollections(collectionNames);
  for(const collectionName of collectionNames) {
    await database.collections[collectionName].removeMany({});
  }
}

export async function removeCollection(collectionName) {
  return removeCollections([collectionName]);
}

export async function createMeter({capabilityAgent, serviceType} = {}) {
  if(!(serviceType && typeof serviceType === 'string')) {
    throw new TypeError('"serviceType" must be a string.');
  }

  // create signer using the application's capability invocation key
  const {keys: {capabilityInvocationKey}} = getAppIdentity();

  const zcapClient = new ZcapClient({
    agent: httpsAgent,
    invocationSigner: capabilityInvocationKey.signer(),
    SuiteClass: Ed25519Signature2020
  });

  // create a meter
  const meterService = `${bedrock.config.server.baseUri}/meters`;
  let meter = {
    controller: capabilityAgent.id,
    product: {
      id: mockData.productIdMap.get(serviceType)
    }
  };

  ({data: {meter}} = await zcapClient.write({url: meterService, json: meter}));

  const {id} = meter;
  return {id: `${meterService}/${id}`};
}

// the `keystores` endpoint uses session based authentication which is
// mocked
export async function createKeystore({
  capabilityAgent, ipAllowList, referenceId, meterId,
  kmsBaseUrl = `${bedrock.config.server.baseUri}/kms`,
  kmsModule = 'ssm-v1',
}) {
  if(!meterId) {
    // create a meter for the keystore
    ({id: meterId} = await createMeter({
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
}

export async function createEdv({
  capabilityAgent, keystoreAgent, urls,
  keyAgreementKey, hmac, referenceId, meterId
}) {
  if(!meterId) {
    // create a meter for the keystore
    ({id: meterId} = await createMeter({
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
    keyResolver,
    keyAgreementKey,
    hmac,
    httpsAgent
  });

  return {edvClient, edvConfig};
}

// FIXME: make more restrictive, support `did:key` and `did:v1`
export async function keyResolver({id}) {
  if(id.startsWith('did:key:')) {
    return didKeyDriver.get({url: id});
  }
  const response = await httpClient.get(id, {agent: httpsAgent});
  return response.data;
}

/**
 * Delegates a zCap.
 *
 * @param {object} options - Options to use.
 * @param {object} options.zcap - A valid zCap with another user
 *   as the invoker and delegator.
 * @param {object} options.signer - A capabilityAgent.getSigner()
 *   from the someone higher in the capabilityChain than the invoker.
 * @param {object|string} options.parentCapability - The parent capability.
 * @param {Function} options.documentLoader - The document loader to use.
 *
 * @returns {Promise<object>} A signed zCap with a Linked Data Proof.
 */
export async function delegate({
  zcap, signer, parentCapability, documentLoader
}) {
  if(!zcap['@context']) {
    zcap['@context'] = ZCAP_CONTEXT_URL;
  }
  if(!zcap.id) {
    zcap.id = `urn:uuid:${uuid()}`;
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
    purpose: new CapabilityDelegation({parentCapability}),
    documentLoader
  });
}

export async function setKeyId(key) {
  // the keyDescription is required to get publicKeyBase58
  const keyDescription = await key.getKeyDescription();
  // create public ID (did:key) for bob's key
  // TODO: do not use did:key but support a did:v1 based key.
  const fingerprint = (await Ed25519VerificationKey2020.from(keyDescription))
    .fingerprint();
  // invocationTarget.verificationMethod = `did:key:${fingerprint}`;
  key.id = `did:key:${fingerprint}#${fingerprint}`;
}

export async function createEncryptStream({
  data,
  recipients,
  chunkSize = _chunkSize
}) {
  const stream = new ReadableStream({
    pull(controller) {
      controller.enqueue(data);
      controller.close();
    }
  });
  const encryptStream = await cipher.createEncryptStream(
    {recipients, keyResolver, chunkSize});
  // pipe user supplied `stream` through the encrypt stream
  //const readable = forStorage.pipeThrough(encryptStream);
  const readable = stream.pipeThrough(encryptStream);
  return readable.getReader();
}

export async function decryptStream({chunks, keyAgreementKey}) {
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
}
