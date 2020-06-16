/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');
const helpers = require('./helpers');

const data = {};
module.exports = data;

const accounts = data.accounts = {};

// regular permissions
const email = 'alpha@example.com';
accounts[email] = {};
accounts[email].account = helpers.createAccount(email);
accounts[email].meta = {};
accounts[email].meta.sysResourceRole = [{
  sysRole: 'bedrock-test.regular',
  generateResource: 'id'
}];

// this will create the 3 users for the delegation / revoke
// tests.
for(const name of ['alice', 'bob', 'carol']) {
  const _email = `${name}@example.com`;
  accounts[_email] = {};
  accounts[_email].account = helpers.createAccount(_email);
  accounts[_email].meta = {};
  accounts[_email].meta.sysResourceRole = [{
    sysRole: 'bedrock-test.regular',
    generateResource: 'id'
  }];
}

data.baseUrl = config.server.baseUri;
const keyStore = '/kms/keystores/z19tghrZEvcUY5YAG8tPi33P3';

/* eslint-disable quotes, quote-props */
data.config = {
  "id": `${data.baseUrl}/edvs/z19uMCiPNET4YbcPpBcab5mEE`,
  "sequence": 0,
  keyAgreementKey: {
    id: `${data.baseUrl}${keyStore}/keys/z19xp4DANMn8k9Yy8m6ZCE6PV`,
    type: 'X25519KeyAgreementKey2019',
  },
  "hmac": {
    "id": `${data.baseUrl}/${keyStore}/keys/z19pHg1APVprWk1ALrcZUnXWL`,
    "type": "Sha256HmacKey2019"
  }
};

data.doc1 = {
  "id": "z1ABxUcbcnSyMtnenFmeARhUn",
  "sequence": 0,
  "indexed": [
    {
      "hmac": {
        "id": `${data.baseUrl}/kms/z19rREpJY9J14W53mvhGHaTJo`,
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
          "alg": "A256KW",
          "kid": `${data.baseUrl}/kms/z19rREpJY9J14W53mvhGHaTJo`
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

data.doc2 = {
  "id": "z19pjdSMQMkBqqJ5zsaagncfU",
  "sequence": 0,
  "indexed": [
    {
      "hmac": {
        "id": `${data.baseUrl}/kms/z19rREpJY9J14W53mvhGHaTJo`,
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
          "alg": "A256KW",
          "kid": `${data.baseUrl}/kms/z19rREpJY9J14W53mvhGHaTJo`
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

data.docWithAttributes = {
  "id": "z19pjdSMQMkBqqJ5zsbbgbbbb",
  "sequence": 0,
  "indexed": [
    {
      "hmac": {
        "id": `${data.baseUrl}/kms/z19rREpJY9J14W53mvhGHaTJo`,
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
          "alg": "A256KW",
          "kid": `${data.baseUrl}/kms/z19rREpJY9J14W53mvhGHaTJo`
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

data.docWithUniqueAttributes = {
  "id": "z19pjdSMQMkBqqJ5zsbbgcccc",
  "sequence": 0,
  "indexed": [
    {
      "hmac": {
        "id": `${data.baseUrl}/kms/z19rREpJY9J14W53mvhGHaTJo`,
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
          "alg": "A256KW",
          "kid": `${data.baseUrl}/kms/z19rREpJY9J14W53mvhGHaTJo`
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

data.docWithUniqueAttributes2 = {
  "id": "z19pjdSMQMkBqqJ5zsbbggggg",
  "sequence": 0,
  "indexed": [
    {
      "hmac": {
        "id": `${data.baseUrl}/kms/z19rREpJY9J14W53mvhGHaTJo`,
        "type": "Sha256HmacKey2019"
      },
      "sequence": 0,
      "attributes": [
        {
          "name": "CUQaxPtSLtd8L3WBAIkJ4DiVJeqoF6bdnhR7lSaPloZ",
          // different from `data.docWithAttributes`, so permitted
          "value": "RV58Va4904K-18_L5g_vfARXRWEB00knFSGPpukUBro",
          "unique": true
        },
        {
          "name": "DUQaxPtSLtd8L3WBAIkJ4DiVJeqoF6bdnhR7lSaPloZ",
          // same as `data.docWithAttributes` but not unique, so permitted
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
          "alg": "A256KW",
          "kid": `${data.baseUrl}/kms/z19rREpJY9J14W53mvhGHaTJo`
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
/* eslint-enable */

const httpDocs = data.httpDocs = {};

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
