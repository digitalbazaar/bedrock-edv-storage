/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {asyncHandler} = require('bedrock-express');
const {authorizeZcapRevocation} = require('@digitalbazaar/ezcap-express');
const bedrock = require('bedrock');
require('bedrock-express');
const brZCapStorage = require('bedrock-zcap-storage');
const {config} = bedrock;
const cors = require('cors');
const {documentLoader} = require('../documentLoader');
const {Ed25519Signature2020} = require('@digitalbazaar/ed25519-signature-2020');
const helpers = require('../helpers');
const {onError} = helpers;
const storage = require('../storage.js');
const {validate} = require('bedrock-validation');

bedrock.events.on('bedrock-express.configure.routes', app => {
  const routes = helpers.getRoutes();

  /* Note: CORS is used on all endpoints. This is safe because authorization
  uses HTTP signatures + capabilities, not cookies; CSRF is not possible. */

  // insert a revocation
  app.options(routes.revocations, cors());
  app.post(
    routes.revocations,
    cors(),
    // FIXME: update
    validate('bedrock-edv-storage.zcap'),
    //validate({bodySchema: postRevocationBody}),
    authorizeZcapRevocation({
      expectedHost: config.server.host,
      getRootController: helpers.getRootController,
      documentLoader,
      async getExpectedTarget({req}) {
        const edvId = helpers.getEdvId({localId: req.params.edvId});
        // ensure EDV can be retrieved
        await storage.getConfig({id: edvId, req});
        // allow target to be root EDV, main revocations endpoint, *or*
        // zcap-specific revocation endpoint; see ezcap-express for more
        const revocations = `${edvId}/revocations`;
        const revokeZcap = `${revocations}/` +
          encodeURIComponent(req.params.zcapId);
        return {expectedTarget: [edvId, revocations, revokeZcap]};
      },
      suiteFactory() {
        return new Ed25519Signature2020();
      },
      inspectCapabilityChain: helpers.inspectCapabilityChain,
      onError
    }),
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
