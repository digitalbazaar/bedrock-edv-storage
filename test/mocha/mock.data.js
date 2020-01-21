/*!
 * Copyright (c) 2018-2019 Digital Bazaar, Inc. All rights reserved.
 */
/* jshint node: true */

'use strict';

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
  sysRole: 'bedrock-account.regular',
  generateResource: 'id'
}];

data.baseUrl = 'https://bedrock.localhost:18443';

/* eslint-disable quotes, quote-props */
data.config = {
  "id": `${data.baseUrl}/edvs/z19uMCiPNET4YbcPpBcab5mEE`,
  "sequence": 0,
  "kek": {
    "id": `${data.baseUrl}/kms/z19rREpJY9J14W53mvhGHaTJo`,
    "type": "AesKeyWrappingKey2019"
  },
  "hmac": {
    "id": `${data.baseUrl}/kms/z19rREpJY9J14W53mvhGHaTJo`,
    "type": "Sha256HmacKey2019"
  }
};

data.doc1 = {
  "id": "foo",
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
  "id": "foo2",
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
  "id": "hasAttributes1",
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
  "id": "hasUniqueAttributes1",
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
  "id": "hasUniqueAttributes2",
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
