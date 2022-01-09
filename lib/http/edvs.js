/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {asyncHandler} = require('bedrock-express');
const bedrock = require('bedrock');
require('bedrock-express');
const {config, util: {BedrockError}} = bedrock;
const cors = require('cors');
const helpers = require('../helpers');
const {meters} = require('bedrock-meter-usage-reporter');
const edvs = require('../storage/edvs.js');
const {
  postConfigBody, getConfigsQuery
} = require('../../schemas/bedrock-edv-storage');
const {reportOperationUsage, SERVICE_TYPE} = require('./metering');
const middleware = require('./middleware.js');
const {validate} = require('../validator.js');

bedrock.events.on('bedrock-express.configure.routes', app => {
  const cfg = config['edv-storage'];

  const routes = helpers.getRoutes();
  const {baseUri} = config.server;
  const edvRoot = `${baseUri}${routes.edvs}`;

  /* Note: CORS is used on all endpoints. This is safe because authorization
  uses HTTP signatures + capabilities, not cookies; CSRF is not possible. */

  // create a new EDV
  app.options(routes.edvs, cors());
  app.post(
    routes.edvs,
    cors(),
    validate({bodySchema: postConfigBody}),
    // meter must be checked for available usage and to obtain the meter's
    // controller prior to checking the zcap invocation (as the invocation
    // will use the meter's controller as the root controller for EDV
    // creation)
    asyncHandler(async (req, res, next) => {
      const {body: {meterId}} = req;
      const {meter, hasAvailable} = await meters.hasAvailable({
        id: meterId, serviceType: SERVICE_TYPE,
        resources: {storage: cfg.storageCost.edv}
      });
      // store meter information on `req` and call next middleware
      req.meterCheck = {meter, hasAvailable};
      next();
    }),
    // now that the meter information has been obtained, check zcap invocation
    middleware.authorizeZcapInvocation({
      async getExpectedValues() {
        return {
          host: config.server.host,
          // expect root invocation target to match this route; the root zcap
          // will have its controller dynamically set to the controller of the
          // meter used as below in `getRootController`
          rootInvocationTarget: edvRoot
        };
      },
      async getRootController({req}) {
        // use meter's controller as the root controller for the EDV
        // creation endpoint
        return req.meterCheck.meter.controller;
      }
    }),
    asyncHandler(async (req, res) => {
      const {body: {meterId}, meterCheck: {hasAvailable}} = req;
      if(!hasAvailable) {
        // insufficient remaining storage
        throw new BedrockError('Permission denied.', 'NotAllowedError', {
          httpStatusCode: 403,
          public: true,
        });
      }

      // FIXME: this is a high-latency call -- consider adding the meter
      // in parallel with inserting the EDV, optimistically presuming it
      // will be added; we could decide that the case of a missing/invalid
      // meter is a possible state we have to deal in other cases anyway
      // https://github.com/digitalbazaar/bedrock-edv-storage/issues/82

      // add meter
      await meters.upsert({id: meterId, serviceType: SERVICE_TYPE});

      // do not allow client to choose EDV ID; client may only choose doc IDs
      delete req.body.id;
      const id = helpers.getEdvId({localId: await helpers.generateRandom()});
      const config = {id, ...req.body};

      // create an EDV for the controller
      const record = await edvs.insert({config});
      res.status(201).location(id).json(record.config);
    }));

  // get EDVs by query
  app.get(
    routes.edvs,
    cors(),
    validate({querySchema: getConfigsQuery}),
    middleware.authorizeZcapInvocation({
      async getExpectedValues() {
        return {
          host: config.server.host,
          // expect root invocation target to match this route; the root zcap
          // will have its controller dynamically set to the controller used
          // in the query
          rootInvocationTarget: edvRoot
        };
      },
      async getRootController({req}) {
        // use query controller as the root controller for the EDV
        // query endpoint
        return req.query.controller;
      }
    }),
    asyncHandler(async (req, res) => {
      const {controller, referenceId} = req.query;
      const query = {'config.referenceId': referenceId};
      const results = await edvs.find({
        controller, query,
        options: {projection: {_id: 0, config: 1}}
      });
      res.json(results.map(r => r.config));
    }));

  // update a config
  app.options(routes.edv, cors());
  app.post(
    routes.edv,
    cors(),
    validate({bodySchema: postConfigBody}),
    middleware.getEdvConfig,
    // FIXME: if a new meter is sent, set the root controller to be that of
    // the meter; otherwise set it to be that of the EDV config
    middleware.authorizeEdvZcapInvocation(),
    asyncHandler(async (req, res) => {
      const {body: config} = req;
      const {config: existingConfig} = req.edv;
      if(existingConfig.id !== config.id) {
        throw new BedrockError(
          'Configuration "id" does not match.',
          'URLMismatchError', {
            httpStatusCode: 400,
            public: true,
            requestUrl: existingConfig.id,
            configId: config.id,
            expected: existingConfig.id,
            actual: config.id
          });
      }

      // add meter if a new one was given
      let {meterId} = config;
      if(meterId && meterId !== existingConfig.meterId) {
        // FIXME: only enable once root controller FIXME is addressed above
        // for the case where a new meter is sent
        throw new Error('Not implemented; meter cannot be changed.');
        // await meters.upsert({id: meterId, serviceType: SERVICE_TYPE});
      } else {
        ({meterId} = existingConfig);
      }

      // ensure `meterId` is set on config (using either existing one or new
      // one)
      config.meterId = meterId;

      await edvs.update({config});
      res.json({config});

      // meter operation usage
      reportOperationUsage({req});
    }));

  // get an EDV config
  app.get(
    routes.edv,
    cors(),
    middleware.getEdvConfig,
    middleware.authorizeEdvZcapInvocation(),
    asyncHandler(async (req, res) => {
      res.json(req.edv.config);
    }));
});
