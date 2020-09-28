/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config, util: {uuid}} = require('bedrock');
const brEdvStorage = require('bedrock-edv-storage');
const brHttpsAgent = require('bedrock-https-agent');
// const {AsymmetricKey, CapabilityAgent} = require('webkms-client');
const {SECURITY_CONTEXT_V2_URL} = require('jsonld-signatures');
// const {CapabilityDelegation} = require('ocapld');
// const database = require('bedrock-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');
const {EdvClient} = require('edv-client');

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
  let passportStub;
  let aliceEdvClient;
  let aliceEdvConfig;

  before(async () => {
    await helpers.prepareDatabase(mockData);
  });

  before(async () => {
    // first create 3 testers alice, bob, and carol
    testers = await helpers.makeDelegationTesters({
      testers: ['alice', 'bob', 'carol'],
      mockData
    });
    passportStub = helpers.stubPassport({actor: testers.alice.actor});
    ({edvClient: aliceEdvClient, edvConfig: aliceEdvConfig} =
      await helpers.createEdv({
        capabilityAgent: testers.alice.capabilityAgent,
        hmac: testers.alice.hmac,
        keyAgreementKey: testers.alice.keyAgreementKey,
        invocationSigner: testers.alice.capabilityAgent.getSigner(),
        urls,
      }));
  });

  after(() => {
    passportStub.restore();
  });

  it('should delegate & revoke access', async () => {
    // convert bob's key ID to a did:key:
    await helpers.setKeyId(testers.bob.verificationKey);

    // alice is the controller of the EDV
    const capabilityDelegation = {
      id: `urn:zcap:${uuid()}`,
      '@context': SECURITY_CONTEXT_V2_URL,
      allowedAction: 'read',
      invoker: testers.bob.verificationKey.id,
      parentCapability: `${aliceEdvConfig.id}/zcaps/documents/${docId}`,
      invocationTarget: {
        type: 'urn:datahub:document',
        id: `${aliceEdvConfig.id}/documents/${docId}`
      }
    };
    await helpers.delegate({
      zcap: capabilityDelegation,
      signer: testers.alice.capabilityAgent.getSigner(),
      capabilityChain: [
        capabilityDelegation.parentCapability,
      ]
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
    const {httpsAgent} = brHttpsAgent;
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
    const writeZcap = {
      id: `urn:zcap:${uuid()}`,
      '@context': SECURITY_CONTEXT_V2_URL,
      allowedAction,
      invoker: testers.bob.verificationKey.id,
      delegator: testers.bob.verificationKey.id,
      // Documents are not zCaps so this route stores all zCaps
      // for a document.
      parentCapability: `${mockEdvId}/zcaps/documents/${docId}`,
      invocationTarget: {
        type: 'urn:datahub:document',
        id: `${mockEdvId}/documents/${docId}`
      }
    };
    let record = await brEdvStorage.insert({
      actor: testers.alice.actor,
      edvId: mockEdvId,
      doc,
    });
    // We are testing these methods:
    //      await helpers.authorize({
    //        req, expectedTarget, expectedRootCapability, expectedAction
    //      });
    // await brEdvStorage.update({actor, edvId: mockEdvId, doc: mockData.doc2});
    // await helpers.verifyDelegation({edvId, controller, capability});
    // await brZCapStorage.revocations.insert({controller, capability});
    // test the default behavior that Alice can write to her own EDV,
    // but that bob and carol can not.
  });
  /* eslint-enable */
});
