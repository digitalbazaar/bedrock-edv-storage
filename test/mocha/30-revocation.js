/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import {config} from '@bedrock/core';
import * as brEdvStorage from '@bedrock/edv-storage';
import * as helpers from './helpers.js';
import {createRequire} from 'node:module';
import {httpsAgent} from '@bedrock/https-agent';
import {mockData} from './mock.data.js';
import {v4 as uuid} from 'uuid';
const require = createRequire(import.meta.url);
const {constants: {ZCAP_CONTEXT_URL}} = require('@digitalbazaar/zcap');
const {EdvClient} = require('@digitalbazaar/edv-client');

// all tests involve write
const allowedAction = 'write';
// a unique id for the single document in this test
const docId = 'z19pjAGaCdp2EkKzUcvdSf9wG';

// common URLs
const {baseUri} = config.server;
const root = `${baseUri}/edvs`;
const invalid = `${baseUri}/edvs/invalid`;
const urls = {
  edvs: root,
  invalidDocuments: `${invalid}/documents`,
  invalidQuery: `${invalid}/query`
};

const JWE_ALG = 'ECDH-ES+A256KW';

describe('revocation API', function() {
  // TODO: Rename this.
  // TODO: Move this to helpers.
  let testers = null;
  let aliceEdvClient;
  let aliceEdvConfig;

  before(async () => {
    await helpers.prepareDatabase();
  });

  before(async () => {
    // first create 3 testers alice, bob, and carol
    testers = await helpers.makeDelegationTesters({
      testers: ['alice', 'bob', 'carol'],
      mockData
    });
    ({edvClient: aliceEdvClient, edvConfig: aliceEdvConfig} =
      await helpers.createEdv({
        capabilityAgent: testers.alice.capabilityAgent,
        hmac: testers.alice.hmac,
        keyAgreementKey: testers.alice.keyAgreementKey,
        urls,
      }));
  });

  it('should delegate & revoke access', async () => {
    // convert bob's key ID to a did:key:
    await helpers.setKeyId(testers.bob.verificationKey);

    // root zcap for alice's EDV
    const rootZcap = `urn:zcap:root:${encodeURIComponent(aliceEdvConfig.id)}`;

    const capabilityDelegation = {
      '@context': ZCAP_CONTEXT_URL,
      id: `urn:zcap:${uuid()}`,
      // attenuate so only read authority is granted
      allowedAction: 'read',
      controller: testers.bob.verificationKey.id,
      parentCapability: rootZcap,
      // attenuate such that only this document can be read
      invocationTarget: `${aliceEdvConfig.id}/documents/${docId}`,
      expires: new Date(Date.now() + 300000).toISOString()
    };
    await helpers.delegate({
      zcap: capabilityDelegation,
      signer: testers.alice.capabilityAgent.getSigner(),
      parentCapability: capabilityDelegation.parentCapability,
      documentLoader: mockData.documentLoader
    });

    const docContent = {
      foo: 'bar',
    };

    // alice creates a document in the EDV
    await aliceEdvClient.insert({
      doc: {
        id: docId,
        content: docContent,
      },
      invocationSigner: testers.alice.capabilityAgent.getSigner(),
      recipients: [{header: {
        kid: testers.alice.keyAgreementKey.id,
        alg: JWE_ALG
      }}, {header: {
        kid: testers.bob.keyAgreementKey.id,
        alg: JWE_ALG
      }}],
    });

    let resultAliceGet;
    let err;
    try {
      // alice can read the document she created
      resultAliceGet = await aliceEdvClient.get({
        id: docId,
        invocationSigner: testers.alice.capabilityAgent.getSigner(),
      });
    } catch(e) {
      err = e;
    }
    should.not.exist(err);
    resultAliceGet.content.should.eql(docContent);

    // create and EdvClient for bob
    const bobEdvClient = new EdvClient({
      keyAgreementKey: testers.bob.keyAgreementKey,
      httpsAgent
    });

    // bob can read the document alice created
    const resultBobGet = await bobEdvClient.get({
      id: docId,
      capability: capabilityDelegation,
      invocationSigner: testers.bob.verificationKey,
    });
    resultBobGet.content.should.eql(docContent);

    // alice revokes bob's capability
    await aliceEdvClient.revokeCapability({
      capabilityToRevoke: capabilityDelegation,
      invocationSigner: testers.alice.capabilityAgent.getSigner(),
    });

    // bob can no longer read the document alice created
    let resultBobGetAfterRevocation;
    err = null;
    try {
      resultBobGetAfterRevocation = await bobEdvClient.get({
        id: docId,
        capability: capabilityDelegation,
        invocationSigner: testers.bob.verificationKey,
      });
    } catch(e) {
      err = e;
    }
    should.not.exist(resultBobGetAfterRevocation);
    should.exist(err);
    err.data.type.should.equal('NotAllowedError');
  });

  // TODO: this more comprehensive test is to be completed later
  /* eslint-disable */
  it.skip('should delegate & revoke write access II', async () => {
    // bob delegates his write capability from alice to carol.
    // all 3 of them are able to write to the same EDV.
    // Bob revoke's carol's capability
    // Alice & Bob can still write, but Carol can not.
    // Alice revoke's Bob's capability
    // Only Alice can write to the EDV.
    //

    const doc = {
      id: docId,
      sequence: 0,
      content: {
        modifier: testers.alice.email
      },
      jwe: {
        recipients: [
          {
            header: {
              alg: helpers.JWE_ALG,
              kid: testers.alice.keyAgreementKey.id
            }
          },
          {
            header: {
              alg: helpers.JWE_ALG,
              kid: testers.bob.keyAgreementKey.id
            }
          }
        ]
      }
    };
    // alice delegates a `write` capability to bob with bob as a delegator
    // this will be stored in authorizations
    const rootZcap = `urn:zcap:root:${encodeURIComponent(mockEdvId)}`;
    const writeZcap = {
      id: `urn:zcap:${uuid()}`,
      '@context': ZCAP_CONTEXT_URL,
      allowedAction,
      invoker: testers.bob.verificationKey.id,
      delegator: testers.bob.verificationKey.id,
      parentCapability: rootZcap,
      invocationTarget: {
        type: 'urn:datahub:document',
        id: `${mockEdvId}/documents/${docId}`
      }
    };
    let record = await brEdvStorage.insert({
      edvId: mockEdvId,
      doc,
    });
    // test the default behavior that Alice can write to her own EDV,
    // but that bob and carol can not.
  });
  /* eslint-enable */
});
