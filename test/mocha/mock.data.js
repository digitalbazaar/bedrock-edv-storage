/*!
 * Copyright (c) 2018-2025 Digital Bazaar, Inc. All rights reserved.
 */
import {config} from '@bedrock/core';
import {didIo} from '@bedrock/did-io';
import {documentLoader} from '@bedrock/jsonld-document-loader';

export const mockData = {};

// mock product IDs and reverse lookup for webkms/edv/etc service products
mockData.productIdMap = new Map([
  // webkms service
  ['webkms', 'urn:uuid:80a82316-e8c2-11eb-9570-10bf48838a41'],
  ['urn:uuid:80a82316-e8c2-11eb-9570-10bf48838a41', 'webkms'],
  // edv service
  ['edv', 'urn:uuid:dbd15f08-ff67-11eb-893b-10bf48838a41'],
  ['urn:uuid:dbd15f08-ff67-11eb-893b-10bf48838a41', 'edv']
]);

mockData.baseUrl = config.server.baseUri;
const keyStore = '/kms/keystores/z19tghrZEvcUY5YAG8tPi33P3';

mockData.config = {
  id: `${mockData.baseUrl}/edvs/z19uMCiPNET4YbcPpBcab5mEE`,
  controller: 'did:key:z6Mksbz5LDhX9WAYZxZ8sHinN7xeSSB3PWYRxTdJGrMyshN2',
  sequence: 0,
  keyAgreementKey: {
    id: `${mockData.baseUrl}${keyStore}/keys/z19xp4DANMn8k9Yy8m6ZCE6PV`,
    type: 'X25519KeyAgreementKey2020',
  },
  hmac: {
    id: `${mockData.baseUrl}/${keyStore}/keys/z19pHg1APVprWk1ALrcZUnXWL`,
    type: 'Sha256HmacKey2019'
  },
  meterId: 'https://localhost:18443/meters/zLd2ijgM1PoJvvULK9Wwx37'
};

/* eslint-disable quotes, quote-props, max-len */
mockData.doc1 = {
  "id": "z1ABxUcbcnSyMtnenFmeARhUn",
  "sequence": 0,
  "indexed": [
    {
      "hmac": {
        "id": `${mockData.baseUrl}/kms/z19rREpJY9J14W53mvhGHaTJo`,
        "type": "Sha256HmacKey2019"
      },
      "sequence": 0,
      "attributes": []
    }
  ],
  "jwe": {
    "protected": "eyJlbmMiOiJDMjBQIn0",
    "recipients": [
      {
        "header": {
          "alg": "ECDH-ES+A256KW",
          "kid": `${mockData.baseUrl}/kms/z19rREpJY9J14W53mvhGHaTJo`
        },
        "encrypted_key":
          "HM00migkUSdZjvqmq4b7ixiXnfeLieA7QX2ew6OF4oPUA3HovaMnOw"
      }
    ],
    "iv": "S-bNe9DayHcXWhBH",
    "ciphertext": "bcZnPyreRmcLCngVbMHJTNeIIxkSJno",
    "tag": "R2xDL9AJo7IhZ7y_sebgJw"
  }
};

mockData.doc2 = {
  "id": "z19pjdSMQMkBqqJ5zsaagncfU",
  "sequence": 0,
  "indexed": [
    {
      "hmac": {
        "id": `${mockData.baseUrl}/kms/z19rREpJY9J14W53mvhGHaTJo`,
        "type": "Sha256HmacKey2019"
      },
      "sequence": 0,
      "attributes": []
    }
  ],
  "jwe": {
    "protected": "eyJlbmMiOiJDMjBQIn0",
    "recipients": [
      {
        "header": {
          "alg": "ECDH-ES+A256KW",
          "kid": `${mockData.baseUrl}/kms/z19rREpJY9J14W53mvhGHaTJo`
        },
        "encrypted_key":
          "HM00migkUSdZjvqmq4b7ixiXnfeLieA7QX2ew6OF4oPUA3HovaMnOw"
      }
    ],
    "iv": "S-bNe9DayHcXWhBH",
    "ciphertext": "bcZnPyreRmcLCngVbMHJTNeIIxkSJno",
    "tag": "R2xDL9AJo7IhZ7y_sebgJw"
  }
};

mockData.docWithAttributes = {
  "id": "z19pjdSMQMkBqqJ5zsbbgbbbb",
  "sequence": 0,
  "indexed": [
    {
      "hmac": {
        "id": `${mockData.baseUrl}/kms/z19rREpJY9J14W53mvhGHaTJo`,
        "type": "Sha256HmacKey2019"
      },
      "sequence": 0,
      "attributes": [
        {
          "name": "CUQaxPtSLtd8L3WBAIkJ4DiVJeqoF6bdnhR7lSaPloY",
          "value": "QV58Va4904K-18_L5g_vfARXRWEB00knFSGPpukUBro"
        },
        {
          "name": "CUQaxPtSLtd8L3WBAIkJ4DiVJeqoF6bdnhR7lSaPloY",
          "value": "QV58Va4904K-18_L5g_vfARXRWEB00knFSGPpukUSis"
        }
      ]
    }
  ],
  "jwe": {
    "protected": "eyJlbmMiOiJDMjBQIn0",
    "recipients": [
      {
        "header": {
          "alg": "ECDH-ES+A256KW",
          "kid": `${mockData.baseUrl}/kms/z19rREpJY9J14W53mvhGHaTJo`
        },
        "encrypted_key":
          "OR1vdCNvf_B68mfUxFQVT-vyXVrBembuiM40mAAjDC1-Qu5iArDbug"
      }
    ],
    "iv": "i8Nins2vTI3PlrYW",
    "ciphertext": "Cb-963UCXblINT8F6MDHzMJN9EAhK3I",
    "tag": "pfZO0JulJcrc3trOZy8rjA"
  }
};

mockData.docWithUniqueAttributes = {
  "id": "z19pjdSMQMkBqqJ5zsbbgcccc",
  "sequence": 0,
  "indexed": [
    {
      "hmac": {
        "id": `${mockData.baseUrl}/kms/z19rREpJY9J14W53mvhGHaTJo`,
        "type": "Sha256HmacKey2019"
      },
      "sequence": 0,
      "attributes": [
        {
          "name": "CUQaxPtSLtd8L3WBAIkJ4DiVJeqoF6bdnhR7lSaPloZ",
          "value": "QV58Va4904K-18_L5g_vfARXRWEB00knFSGPpukUBro",
          "unique": true
        },
        {
          "name": "DUQaxPtSLtd8L3WBAIkJ4DiVJeqoF6bdnhR7lSaPloZ",
          "value": "QV58Va4904K-18_L5g_vfARXRWEB00knFSGPpukUBro"
        }
      ]
    }
  ],
  "jwe": {
    "protected": "eyJlbmMiOiJDMjBQIn0",
    "recipients": [
      {
        "header": {
          "alg": "ECDH-ES+A256KW",
          "kid": `${mockData.baseUrl}/kms/z19rREpJY9J14W53mvhGHaTJo`
        },
        "encrypted_key":
          "OR1vdCNvf_B68mfUxFQVT-vyXVrBembuiM40mAAjDC1-Qu5iArDbug"
      }
    ],
    "iv": "i8Nins2vTI3PlrYW",
    "ciphertext": "Cb-963UCXblINT8F6MDHzMJN9EAhK3I",
    "tag": "pfZO0JulJcrc3trOZy8rjA"
  }
};

mockData.docWithUniqueAttributes2 = {
  "id": "z19pjdSMQMkBqqJ5zsbbggggg",
  "sequence": 0,
  "indexed": [
    {
      "hmac": {
        "id": `${mockData.baseUrl}/kms/z19rREpJY9J14W53mvhGHaTJo`,
        "type": "Sha256HmacKey2019"
      },
      "sequence": 0,
      "attributes": [
        {
          "name": "CUQaxPtSLtd8L3WBAIkJ4DiVJeqoF6bdnhR7lSaPloZ",
          // different from `mockData.docWithAttributes`, so permitted
          "value": "RV58Va4904K-18_L5g_vfARXRWEB00knFSGPpukUBro",
          "unique": true
        },
        {
          "name": "DUQaxPtSLtd8L3WBAIkJ4DiVJeqoF6bdnhR7lSaPloZ",
          // same as `mockData.docWithAttributes` but not unique, so permitted
          "value": "QV58Va4904K-18_L5g_vfARXRWEB00knFSGPpukUBro"
        }
      ]
    }
  ],
  "jwe": {
    "protected": "eyJlbmMiOiJDMjBQIn0",
    "recipients": [
      {
        "header": {
          "alg": "ECDH-ES+A256KW",
          "kid": `${mockData.baseUrl}/kms/z19rREpJY9J14W53mvhGHaTJo`
        },
        "encrypted_key":
          "OR1vdCNvf_B68mfUxFQVT-vyXVrBembuiM40mAAjDC1-Qu5iArDbug"
      }
    ],
    "iv": "i8Nins2vTI3PlrYW",
    "ciphertext": "Cb-963UCXblINT8F6MDHzMJN9EAhK3I",
    "tag": "pfZO0JulJcrc3trOZy8rjA"
  }
};

mockData.docWithAttributesAttributes = [
  'A1u9VuS0+oJSucYVfIT1CEx6wS6YFIHZgJsJwz8eGJQ=:CUQaxPtSLtd8L3WBAIkJ4DiVJeqoF6bdnhR7lSaPloY:QV58Va4904K-18_L5g_vfARXRWEB00knFSGPpukUBro',
  'A1u9VuS0+oJSucYVfIT1CEx6wS6YFIHZgJsJwz8eGJQ=:CUQaxPtSLtd8L3WBAIkJ4DiVJeqoF6bdnhR7lSaPloY:QV58Va4904K-18_L5g_vfARXRWEB00knFSGPpukUSis'
];
/* eslint-enable */

const httpDocs = mockData.httpDocs = {};

httpDocs.alpha = {
  id: 'z19pjdSMQMkBqqJ5zsbbaaaaa',
  content: {
    apples: [1, 6],
    oranges: 2,
    pears: 3,
    group: 'group1',
    subgroup: 'subgroup1',
    id: 'alpha',
  }
};

httpDocs.beta = {
  id: 'z19pjdSMQMkBqqJ5zsbbgbeta',
  content: {
    apples: 10,
    oranges: 20,
    pears: 30,
    group: 'group1',
    subgroup: 'subgroup1',
    id: 'beta',
  }
};

httpDocs.gamma = {
  id: 'z19pjdSMQMkBqqJ5zsbbgcccc',
  content: {
    apples: 100,
    oranges: 200,
    pears: 300,
    group: 'group1',
    subgroup: 'subgroup2',
    id: 'gamma',
  }
};

httpDocs.delta = {
  id: 'z19pjdSMQMkBqqJ5zsbbgdddd',
  content: {
    apples: 1000,
    oranges: 2000,
    pears: 3000,
  }
};

mockData.documentLoader = async function _documentLoader(url) {
  let document;
  if(url.startsWith('did:')) {
    document = await didIo.get({did: url, forceConstruct: true});
    // FIXME: Remove the startsWith() logic once did-io.get() return signature
    // is updated.
    if(url.startsWith('did:v1:')) {
      document = document.doc;
    }
    return {
      contextUrl: null,
      documentUrl: url,
      document
    };
  }

  return documentLoader(url);
};
