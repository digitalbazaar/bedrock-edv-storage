/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');
const path = require('path');
require('bedrock-permission');
require('bedrock-edv-storage');

const {permissions, roles} = config.permission;

config.mocha.tests.push(path.join(__dirname, 'mocha'));

// mongodb config
config.mongodb.name = 'bedrock_edv_storage_test';
config.mongodb.host = 'localhost';
config.mongodb.port = 27017;
config.mongodb.local.collection = 'bedrock_edv_storage_test';
// drop all collections on initialization
config.mongodb.dropCollections = {};
config.mongodb.dropCollections.onInit = true;
config.mongodb.dropCollections.collections = [];

roles['bedrock-test.regular'] = {
  id: 'bedrock-test.regular',
  label: 'Test Role',
  comment: 'Role for Test User',
  sysPermission: [
    permissions.ACCOUNT_ACCESS.id,
    permissions.ACCOUNT_UPDATE.id,
    permissions.ACCOUNT_INSERT.id,
    permissions.EDV_CONFIG_ACCESS.id,
    permissions.EDV_CONFIG_UPDATE.id,
    permissions.EDV_CONFIG_REMOVE.id
  ]
};

config['https-agent'].rejectUnauthorized = false;

config.kms.allowedHost = config.server.host;

// optionally require an authenticated session
// this option may be set to false when operating behind an authenticated proxy
config['kms-http'].requireAuthentication = false;
