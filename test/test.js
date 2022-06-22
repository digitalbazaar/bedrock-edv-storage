/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import './polyfills.js';

import * as bedrock from '@bedrock/core';
import '@bedrock/ssm-mongodb';
import {getServiceIdentities} from '@bedrock/app-identity';
import '@bedrock/https-agent';
import '@bedrock/kms';
import '@bedrock/kms-http';
import '@bedrock/meter';
import {handlers} from '@bedrock/meter-http';
import '@bedrock/meter-usage-reporter';
import '@bedrock/security-context';
import '@bedrock/server';
import '@bedrock/edv-storage';
import '@bedrock/test';

import {mockData} from './mocha/mock.data.js';

bedrock.events.on('bedrock.init', async () => {
  /* Handlers need to be added before `bedrock.start` is called. These are
  no-op handlers to enable meter usage without restriction */
  handlers.setCreateHandler({
    handler({meter} = {}) {
      // use configured meter usage reporter as service ID for tests
      const clientName = mockData.productIdMap.get(meter.product.id);
      const serviceIdentites = getServiceIdentities();
      const serviceIdentity = serviceIdentites.get(clientName);
      if(!serviceIdentity) {
        throw new Error(`Could not find identity "${clientName}".`);
      }
      meter.serviceId = serviceIdentity.id;
      return {meter};
    }
  });
  handlers.setUpdateHandler({handler: ({meter} = {}) => ({meter})});
  handlers.setRemoveHandler({handler: ({meter} = {}) => ({meter})});
  handlers.setUseHandler({handler: ({meter} = {}) => ({meter})});
});

bedrock.start();
