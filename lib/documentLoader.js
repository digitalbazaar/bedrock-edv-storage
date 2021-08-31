/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {didIo} = require('bedrock-did-io');
const {documentLoader} = require('bedrock-jsonld-document-loader');

require('bedrock-did-context');
require('bedrock-veres-one-context');
require('bedrock-security-context');

// load config defaults
require('./config');

exports.documentLoader = async url => {
  let document;
  if(url.startsWith('did:')) {
    document = await didIo.get({did: url});
    return {
      contextUrl: null,
      documentUrl: url,
      document
    };
  }

  // finally, try the bedrock document loader
  return documentLoader(url);
};
