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

const mockEdvId = `${config.server.baseUri}/edvs/z19xXoFRcobgskDQ6ywrRaa16`;
const hashedMockEdvId = database.hash(mockEdvId);
// all tests involve write
const expectedAction = 'write';

describe('revocation API', function() {
  let actors, accounts = null;
  // first create 3 keys alice, bob, and carol
  const capabilityAgents = {
    alice: null,
    bob: null,
    carol: null
  };
  beforeEach(async function() {
    capabilityAgents.alice = await CapabilityAgent.fromSecret({
      secret: '40762a17-1696-428f-a2b2-ddf9fe9b4987',
      handle: 'aliceKey'
    });
    capabilityAgents.bob = await CapabilityAgent.fromSecret({
      secret: '34f2afd1-34ef-4d46-a998-cdc5462dc0d2',
      handle: 'bobKey'
    });
    capabilityAgents.carol = await CapabilityAgent.fromSecret({
      secret: 'ae806cd9-2765-4232-b955-01e1024ac032',
      handle: 'carolKey'
    });
    await helpers.prepareDatabase(mockData);
    actors = await helpers.getActors(mockData);
    accounts = mockData.accounts;
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
    //        req, expectedTarget, expectedRootCapability, expectedAction: 'write'
    //      });
    // await brEdvStorage.update({actor, edvId: mockEdvId, doc: mockData.doc2});
    // await helpers.verifyDelegation({edvId, controller, capability});
    // await brZCapStorage.revocations.insert({controller, capability});
    
    
    // test the default behavior that Alice can write to her own EDV,
    // but that bob and carol can not. 
    const doc = {
    
    }

  });
});
