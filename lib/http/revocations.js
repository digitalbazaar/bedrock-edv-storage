/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as brZCapStorage from '@bedrock/zcap-storage';
import * as helpers from '../helpers.js';
import * as middleware from './middleware.js';
import {asyncHandler} from '@bedrock/express';
import {createValidateMiddleware as validate} from '@bedrock/validation';
import {meters} from '@bedrock/meter-usage-reporter';
import {reportOperationUsage, SERVICE_TYPE} from './metering.js';
import {postRevocationBody} from '../../schemas/bedrock-edv-storage.js';

const {cors} = middleware;
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
    middleware.getEdvConfig,
    middleware.authorizeZcapRevocation(),
    asyncHandler(async (req, res) => {
      const {
        body: capability,
        edv: {config},
        zcapRevocation: {delegator}
      } = req;

      // check meter revocation usage; but only check to see if the meter
      // is disabled or not; allow storage overflow with revocations to
      // ensure security can be locked down; presumption is this endpoint
      // will be heavily rate limited
      const {meterId} = config;
      const {meter: {disabled}} = await meters.hasAvailable({
        id: meterId, serviceType: SERVICE_TYPE,
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
      await brZCapStorage.revocations.insert(
        {delegator, rootTarget: config.id, capability});

      // success, no response body
      res.status(204).end();

      // report operation usage
      reportOperationUsage({req});
    }));
});
