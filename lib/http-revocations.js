/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {asyncHandler} = require('bedrock-express');
const bedrock = require('bedrock');
const brZCapStorage = require('bedrock-zcap-storage');
const {config} = bedrock;
const cors = require('cors');
const database = require('bedrock-mongodb');
const helpers = require('./helpers');

// load config defaults
require('./config');

const routes = {
  edvs: '/edvs',
  revocations: '/edvs/:edvId/revocations',
};

bedrock.events.on('bedrock-express.configure.routes', app => {
  const {baseUri} = config.server;
  const baseStorageUrl = `${baseUri}${routes.edvs}`;

  function _getEdvId(edvIdParam) {
    helpers.assert128BitId(edvIdParam);
    return `${baseStorageUrl}/${edvIdParam}`;
  }

  // insert a revocation
  app.options(routes.revocations, cors());
  app.post(
    routes.revocations,
    // CORs is safe because revocation uses HTTP signatures + capabilities,
    // not cookies
    cors(),
    // TODO: add zcap validator
    //validate('bedrock-edv-storage.zcap'),
    asyncHandler(async (req, res) => {
      // check revocation
      const edvId = _getEdvId(req.params.edvId);
      const expectedTarget = `${edvId}/revocations`;
      const expectedRootCapability = `${edvId}/zcaps/revocations`;
      const {invoker} = await helpers.authorize({
        req, expectedTarget, expectedRootCapability, expectedAction: 'write'
      });

      // verify CapabilityDelegation before storing zcap
      const controller = invoker;
      const capability = req.body;
      await helpers.verifyDelegation({edvId, controller, capability});
      await brZCapStorage.revocations.insert({controller, capability});
      res.status(204).end();
    }));

  // get one or more revocations
  app.get(
    routes.revocations,
    asyncHandler(async (req, res) => {
      // check revocation
      const edvId = _getEdvId(req.params.edvId);
      const expectedTarget = `${edvId}/revocations`;
      const expectedRootCapability = `${edvId}/zcaps/revocations`;
      const {invoker} = await helpers.authorize({
        req, expectedTarget, expectedRootCapability, expectedAction: 'read'
      });

      const {id} = req.query;
      if(id) {
        const {revocation} = await brZCapStorage.revocations.get(
          {id, controller: invoker});
        const {capability} = revocation;
        res.json(capability);
      } else {

        // FIXME: does revocations API need a `find` method?
        const query = {controller: database.hash(invoker)};
        const results = await brZCapStorage.revocations.find(
          {query, fields: {_id: 0, capability: 1}});
        res.json(results.map(r => r.capability));
      }
    }));
});
