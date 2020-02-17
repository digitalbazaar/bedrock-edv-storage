/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');
const brEdvStorage = require('bedrock-edv-storage');
const {constants} = require('jsonld-signatures');
const database = require('bedrock-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');

const {SECURITY_CONTEXT_V2_URL} = constants;

let actors;
let accounts;

const mockEdvId = `${config.server.baseUri}/edvs/z19xXoFRcobgskDQ6ywrRaa16`;
const hashedMockEdvId = database.hash(mockEdvId);


describe('revocation API', function() {
  // first create 3 keys alice, bob, and carol
  let aliceKey, bobKey, carolKey = null;

  beforeEach(async function() {

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
