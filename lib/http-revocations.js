/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {asyncHandler} = require('bedrock-express');
const bedrock = require('bedrock');
const brZCapStorage = require('bedrock-zcap-storage');
const {config} = bedrock;
const cors = require('cors');
const helpers = require('./helpers');
const {validate} = require('bedrock-validation');

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
    helpers.verifyDigestHeaderValue,
    validate('bedrock-edv-storage.zcap'),
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
      await brZCapStorage.revocations.insert({
        delegator: controller,
        capability
      });
      res.status(204).end();
    }));
});
