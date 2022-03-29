/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
import {didIo} from 'bedrock-did-io';
import {documentLoader as brDocLoader} from 'bedrock-jsonld-document-loader';

import 'bedrock-did-context';
import 'bedrock-veres-one-context';
import 'bedrock-security-context';

// load config defaults
import './config.js';

export async function documentLoader(url) {
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
  return brDocLoader(url);
}
