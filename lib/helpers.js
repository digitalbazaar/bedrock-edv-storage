/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const base58 = require('base58-universal');
const bedrock = require('bedrock');
const {config, util: {BedrockError}} = bedrock;
const crypto = require('crypto');
const forwarded = require('forwarded');
const {promisify} = require('util');
const getRandomBytes = promisify(crypto.randomBytes);
const {Netmask} = require('netmask');

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

exports.getEdvId = ({localId} = {}) => {
  exports.assert128BitId(localId);
  const {baseUri} = config.server;
  const baseStorageUrl = `${baseUri}${config['edv-storage'].routes.basePath}`;
  return `${baseStorageUrl}/${localId}`;
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
  routes.revocations = `${routes.edv}/zcaps/revocations/:revocationId`;

  return routes;
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

exports.parseLocalId = ({id}) => {
  // format: <base>/<localId>
  const idx = id.lastIndexOf('/');
  const localId = id.substr(idx + 1);
  return {
    base: id.substring(0, idx),
    localId: exports.decodeLocalId({localId})
  };
};

exports.decodeLocalId = ({localId}) => {
  // convert to `Buffer` for storage savings (`z<base58-encoded ID>`)
  // where the ID is multicodec encoded 16 byte random value
  // 0x00 = identity tag, 0x10 = length (16 bytes) header
  return Buffer.from(base58.decode(localId.slice(1)).slice(2));
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

exports.verifyRequestIp = ({edvConfig, req}) => {
  const {ipAllowList} = edvConfig;
  if(!ipAllowList) {
    return {verified: true};
  }

  // the first IP in the sourceAddresses array will *always* be the IP
  // reported by Express.js via `req.connection.remoteAddress`. Any additional
  // IPs will be from the `x-forwarded-for` header.
  const sourceAddresses = forwarded(req);

  // ipAllowList is an array of CIDRs
  for(const cidr of ipAllowList) {
    const netmask = new Netmask(cidr);
    for(const address of sourceAddresses) {
      if(netmask.contains(address)) {
        return {verified: true};
      }
    }
  }

  return {verified: false};
};
