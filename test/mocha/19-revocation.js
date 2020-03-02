/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config, util: {uuid}} = require('bedrock');
const brEdvStorage = require('bedrock-edv-storage');
// const {AsymmetricKey, CapabilityAgent} = require('webkms-client');
const {SECURITY_CONTEXT_V2_URL} = require('jsonld-signatures');
// const {CapabilityDelegation} = require('ocapld');
// const database = require('bedrock-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');
// const {EdvClient} = require('edv-client');

// a unique id for the EDV itself
const mockEdvId = `${config.server.baseUri}/edvs/z1A2RmqSkhYHcnH1UkZamKF1D`;
// const hashedMockEdvId = database.hash(mockEdvId);
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

describe('revocation API', function() {
  // TODO: Rename this.
  // TODO: Move this to helpers.
  let testers = null;
  let passportStub;

  before(async () => {
    await helpers.prepareDatabase(mockData);
  });

  before(async () => {
    // first create 3 testers alice, bob, and carol
    testers = await helpers.makeDelegationTesters({
      testers: ['alice', 'bob', 'carol'],
      mockData
    });
    // const {account, actor} = testers.alice;
    // const edvConfig = {
    //   ...mockData.config,
    //   controller: account.account.id
    // };
    // edvConfig.id = mockEdvId;
    passportStub = helpers.stubPassport({actor: testers.alice.actor});
    await helpers.createEdv({
      capabilityAgent: testers.alice.capabilityAgent,
      keystoreAgent: testers.alice.keystoreAgent,
      urls,
    });
  });

  after(() => {
    passportStub.restore();
  });

  it('should delegate & revoke write access', async () => {
    // alice is the controller of the EDV
    const capabilityDelegation = {
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
    await helpers.delegate({
      zcap: capabilityDelegation,
      signer: testers.alice.capabilityAgent.getSigner(),
      capabilityChain: [
        capabilityDelegation.parentCapability,
      ]
    });
    console.log('DDDDDd', JSON.stringify(capabilityDelegation, null, 2));

  });

  // TODO: this more comprehensive test is to be completed later
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
});
