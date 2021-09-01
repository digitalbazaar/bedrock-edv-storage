/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {asyncHandler} = require('bedrock-express');
const authz = require('./authz.js');
const bedrock = require('bedrock');
require('bedrock-express');
const brZCapStorage = require('bedrock-zcap-storage');
const cors = require('cors');
const helpers = require('../helpers');
const {postRevocationBody} = require('../../schemas/bedrock-edv-storage');
const {validate} = require('../validator.js');

bedrock.events.on('bedrock-express.configure.routes', app => {
  const routes = helpers.getRoutes();

  /* Note: CORS is used on all endpoints. This is safe because authorization
  uses HTTP signatures + capabilities, not cookies; CSRF is not possible. */

  // insert a revocation
  app.options(routes.revocations, cors());
  app.post(
    routes.revocations,
    cors(),
    validate({bodySchema: postRevocationBody}),
    authz.authorizeZcapRevocation(),
    asyncHandler(async (req, res) => {
      const {body: capability, zcapRevocation: {delegator}} = req;

      // FIXME: brZCapStorage needs to support getting a count on stored
      // revocations -- and that count needs to be filtered based on a
      // particular meter
      // https://github.com/digitalbazaar/bedrock-kms-http/issues/55

      // record revocation
      await brZCapStorage.revocations.insert({delegator, capability});

      res.status(204).end();

      // meter operation usage
      const edvId = helpers.getEdvId({localId: req.params.edvId});
      helpers.reportOperationUsageWithoutWaiting({edvId});
    }));
});
