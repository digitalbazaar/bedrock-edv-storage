/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {asyncHandler} = require('bedrock-express');
const authz = require('./authz.js');
const bedrock = require('bedrock');
require('bedrock-express');
const {config, util: {BedrockError}} = bedrock;
const cors = require('cors');
const helpers = require('../helpers');
const {meters} = require('bedrock-meter-usage-reporter');
const {SERVICE_TYPE} = helpers;
const edvs = require('../storage/edvs.js');
const {
  postConfigBody, getConfigsQuery
} = require('../../schemas/bedrock-edv-storage');
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
      // call `next` on the next tick to ensure the promise from this function
      // resolves and does not reject because some subsequent middleware throws
      // an error
      process.nextTick(next);
    }),
    // now that the meter information has been obtained, check zcap invocation
    authz.authorizeZcapInvocation({
      async getExpectedTarget() {
        // use root edv endpoint as expected target; controller will
        // be dynamically set according to the meter referenced by the meter
        // capability
        return {expectedTarget: edvRoot};
      },
      async getRootController({req, rootInvocationTarget}) {
        if(rootInvocationTarget !== edvRoot) {
          throw new BedrockError(
            'The request URL does not match the root invocation target. ' +
            'Ensure that the capability is for the root edvs endpoint. ',
            'URLMismatchError', {
              // this error will be a `cause` in the onError handler;
              // this httpStatusCode is not operative
              httpStatusCode: 400,
              public: true,
              rootInvocationTarget,
              edvRoot
            });
        }
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
    authz.authorizeZcapInvocation({
      async getExpectedTarget() {
        // expected target is the base URL
        return {expectedTarget: edvRoot};
      },
      // root controller is the submitted `controller` -- queries may only
      // happen on a per-controller basis
      async getRootController({req, rootInvocationTarget}) {
        if(rootInvocationTarget === edvRoot) {
          return req.query.controller;
        }
        throw new Error(
          `Invalid root invocation target "${rootInvocationTarget}".`);
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
    validate({bodySchema: postConfigBody}),
    // FIXME: if a new meter is sent, set the root controller to be that of
    // the meter; otherwise set it to be that of the EDV config
    authz.authorizeZcapInvocation({
      getExpectedTarget: _getExpectedConfigTarget
    }),
    asyncHandler(async (req, res) => {
      const id = helpers.getEdvId({localId: req.params.edvId});
      const config = req.body;
      if(id !== config.id) {
        throw new BedrockError(
          'Configuration "id" does not match.',
          'DataError', {
            httpStatusCode: 400,
            public: true,
            expected: id,
            actual: config.id
          });
      }

      const {config: existingConfig} = await edvs.get({id});

      // add meter if a new one was given
      let {meterId} = config;
      if(meterId && meterId !== existingConfig.meterId) {
        // FIXME: only enable once root controller FIXME is addressed above
        // for the case where a new meter is sent
        throw new Error('Not implemented; meter cannot be changed.');
        await meters.upsert({id: meterId, serviceType: SERVICE_TYPE});
      } else {
        ({meterId} = existingConfig);
      }

      // ensure `meterId` is set on config (using either existing one or new
      // one)
      config.meterId = meterId;

      await edvs.update({config});
      res.json(config);

      // meter operation usage
      helpers.reportOperationUsageWithoutWaiting({edvId: id});
    }));

  // get an EDV config
  app.get(
    routes.edv,
    cors(),
    authz.authorizeZcapInvocation({
      async getExpectedTarget({req}) {
        // expected target is the EDV itself
        const edvId = helpers.getEdvId({localId: req.params.edvId});
        return {expectedTarget: edvId};
      }
    }),
    asyncHandler(async (req, res) => {
      const id = helpers.getEdvId({localId: req.params.edvId});
      const {config} = await edvs.get({id});
      res.json(config);

      // meter operation usage
      helpers.reportOperationUsageWithoutWaiting({edvId: id});
    }));
});

async function _getExpectedConfigTarget({req}) {
  // ensure the `configId` matches the request URL (i.e., that the caller
  // POSTed a config with an ID that matches up with the URL to which they
  // POSTed); this is not a security issue if this check is not performed,
  // however, it can help clients debug errors on their end
  const {body: {id: configId}} = req;
  const requestUrl = `${req.protocol}://${req.get('host')}${req.url}`;
  if(configId !== requestUrl) {
    throw new BedrockError(
      'The request URL does not match the configuration ID.',
      'URLMismatchError', {
        // this error will be a `cause` in the onError handler;
        // this httpStatusCode is not operative
        httpStatusCode: 400,
        public: true,
        configId,
        requestUrl,
      });
  }
  return {expectedTarget: configId};
}
