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
const edvs = require('../storage/edvs.js');
const helpers = require('../helpers');
const {meters} = require('bedrock-meter-usage-reporter');
const {postRevocationBody} = require('../../schemas/bedrock-edv-storage');
const {validate} = require('../validator.js');
const {util: {BedrockError}} = bedrock;

bedrock.events.on('bedrock-express.configure.routes', app => {
  const routes = helpers.getRoutes();
  const cfg = bedrock.config['edv-storage'];

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

      // check meter revocation usage; but only check to see if the meter
      // is disabled or not; allow storage overflow with revocations to
      // ensure security can be locked down; presumption is this endpoint
      // will be heavily rate limited
      const edvId = helpers.getEdvId({localId: req.params.edvId});
      const {config: {meterId}} = await edvs.get({id: edvId});
      const {meter: {disabled}} = await meters.hasAvailable({
        id: meterId, serviceType: helpers.SERVICE_TYPE,
        resources: {storage: cfg.storageCost.revocation}
      });
      if(disabled) {
        // meter is disabled, do not allow storage
        throw new BedrockError('Permission denied.', 'NotAllowedError', {
          httpStatusCode: 403,
          public: true,
        });
      }

      // record revocation
      await brZCapStorage.revocations.insert({delegator, capability});

      res.status(204).end();

      // report operation usage
      helpers.reportOperationUsageWithoutWaiting({edvId});
    }));
});
