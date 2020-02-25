/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

require('bedrock-did-context');

// load config defaults
require('./config');

require('./http');
require('./http-revocations');

// module API
module.exports = require('./storage');

