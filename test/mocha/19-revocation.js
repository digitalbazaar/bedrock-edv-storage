/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');
const brEdvStorage = require('bedrock-edv-storage');
const {AsymmetricKey, CapabilityAgent} = require('webkms-client');
const {SECURITY_CONTEXT_V2_URL} = require('jsonld-signatures');
const database = require('bedrock-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');

// a unique id for the EDV itself
const mockEdvId = `${config.server.baseUri}/edvs/z1A2RmqSkhYHcnH1UkZamKF1D`;
const hashedMockEdvId = database.hash(mockEdvId);
// all tests involve write
const expectedAction = 'write';
// algorithm required for the jwe headers
const JWE_ALG = 'ECDH-ES+A256KW';
// a unique id for the single document in this test
const docId = 'z19pjAGaCdp2EkKzUcvdSf9wG';

describe('revocation API', function() {
  let actors, accounts = null;
  // first create 3 testers alice, bob, and carol
  const testers = {
    // alice is the rootCapability
    alice: {
      email: 'alice@example.com',
      secret: '40762a17-1696-428f-a2b2-ddf9fe9b4987',
      handle: 'aliceKey',
      capabilityAgent: null,
      keyStoreAgent: null,
      actor: null,
      account: null
    },
    // bob is delegated write access to alice's EDV
    bob: {
      email: 'bob@example.com',
      secret: '34f2afd1-34ef-4d46-a998-cdc5462dc0d2',
      handle: 'bobKey',
      capabilityAgent: null,
      keyStoreAgent: null,
      actor: null,
      account: null
    },
    // bob delegates his write capability for alice's EDV to carol
    carol: {
      email: 'carol@example.com',
      secret: 'ae806cd9-2765-4232-b955-01e1024ac032',
      handle: 'carolKey',
      capabilityAgent: null,
      keyStoreAgent: null,
      actor: null,
      account: null
    }
  };

  beforeEach(async function() {
    await helpers.prepareDatabase(mockData);
    // {alice, bob, carol} @example.com are in here.
    actors = await helpers.getActors(mockData);
    accounts = mockData.accounts;
    testers.alice.capabilityAgent = await CapabilityAgent.fromSecret({
      secret: testers.alice.secret,
      handle: testers.alice.handle
    });
    testers.alice.keyStoreAgent = await helpers.createKeystore({
      capabilityAgent: testers.alice.capabilityAgent,
      referenceId: testers.alice.secret
    });
    testers.alice.actor = actors[testers.alice.email];
    testers.alice.account = accounts[testers.alice.email];
    testers.bob.capabilityAgent = await CapabilityAgent.fromSecret({
      secret: testers.bob.secret,
      handle: testers.bob.handle
    });
    testers.bob.keyStoreAgent = await helpers.createKeystore({
      capabilityAgent: testers.bob.capabilityAgent,
      referenceId: testers.bob.secret
    });
    testers.bob.actor = actors[testers.bob.email];
    testers.bob.account = accounts[testers.bob.email];
    testers.carol.capabilityAgent = await CapabilityAgent.fromSecret({
      secret: testers.carol.secret,
      handle: testers.carol.handle
    });
    testers.carol.keyStoreAgent = await helpers.createKeystore({
      capabilityAgent: testers.carol.capabilityAgent,
      referenceId: testers.carol.secret
    });
    testers.carol.actor = actors[testers.carol.email];
    testers.carol.account = accounts[testers.carol.email];
    console.log({testers});
  });

  it('should delegate & revoke write access', async function() {
    // alice delegates to bob with bob as a delegator
    // bob delegates his write capability from alice to carol.
    // all 3 of them are able to write to the same EDV.
    // Bob revoke's carol's capability
    // Alice & Bob can still write, but Carol can not.
    // Alice revoke's Bob's capability
    // Only Alice can write to the EDV.
    //
    // We are testing these methods:
    //      await helpers.authorize({
    //        req, expectedTarget, expectedRootCapability, expectedAction
    //      });
    // await brEdvStorage.update({actor, edvId: mockEdvId, doc: mockData.doc2});
    // await helpers.verifyDelegation({edvId, controller, capability});
    // await brZCapStorage.revocations.insert({controller, capability});

    // test the default behavior that Alice can write to her own EDV,
    // but that bob and carol can not.
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
              alg: JWE_ALG,
              kid: `${mockData.baseUrl}/kms/z19rREpJY9J14W53mvhGHaTJo`
            }
          }
        ]
      }
    };
    let record = await brEdvStorage.insert({
      actor: actors['alice@example.com'],
      edvId: mockEdvId,
      doc,
    });

  });
});
