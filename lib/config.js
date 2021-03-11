/*
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
const {config} = bedrock;
const path = require('path');
require('bedrock-permission');
require('bedrock-validation');

const namespace = 'edv-storage';
config[namespace] = {};

// permissions
const permissions = config.permission.permissions;
permissions.EDV_CONFIG_ACCESS = {
  id: 'EDV_CONFIG_ACCESS',
  label: 'Access an Encrypted Data Vault Configuration',
  comment: 'Required to access an Encrypted Data Vault configuration.'
};
permissions.EDV_CONFIG_UPDATE = {
  id: 'EDV_CONFIG_UPDATE',
  label: 'Update an Encrypted Data Vault Configuration',
  comment: 'Required to update an Encrypted Data Vault configuration.'
};
permissions.EDV_CONFIG_REMOVE = {
  id: 'EDV_CONFIG_REMOVE',
  label: 'Remove an Encrypted Data Vault Configuration',
  comment: 'Required to remove an Encrypted Data Vault configuration.'
};

// common validation schemas
config.validation.schema.paths.push(
  path.join(__dirname, '..', 'schemas'));
