/*!
 * Copyright (c) 2018-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const edvConfig = {
  title: 'EDV Configuration',
  type: 'object',
  // TODO: do not require primary `keyAgreementKey` and `hmac` in the future
  required: ['controller', 'sequence', 'keyAgreementKey', 'hmac'],
  additionalProperties: false,
  properties: {
    id: {
      type: 'string'
    },
    controller: {
      type: 'string'
    },
    invoker: {
      anyOf: [{
        type: 'string'
      }, {
        type: 'array',
        minItems: 1,
        items: [{type: 'string'}]
      }]
    },
    delegator: {
      anyOf: [{
        type: 'string'
      }, {
        type: 'array',
        minItems: 1,
        items: [{type: 'string'}]
      }]
    },
    keyAgreementKey: {
      type: 'object',
      required: ['id', 'type'],
      additionalProperties: false,
      properties: {
        id: {
          type: 'string'
        },
        type: {
          type: 'string'
        }
      }
    },
    hmac: {
      type: 'object',
      required: ['id', 'type'],
      additionalProperties: false,
      properties: {
        id: {
          type: 'string'
        },
        type: {
          type: 'string'
        }
      }
    },
    sequence: {
      type: 'integer',
      minimum: 0
    },
    referenceId: {
      type: 'string'
    }
  }
};

const jwe = {
  title: 'JWE with at least one recipient',
  type: 'object',
  required: ['protected', 'recipients', 'iv', 'ciphertext', 'tag'],
  additionalProperties: false,
  properties: {
    protected: {
      type: 'string'
    },
    recipients: {
      type: 'array',
      minItems: 1,
      items: [{
        type: 'object',
        required: ['header', 'encrypted_key'],
        additionalProperties: false,
        properties: {
          header: {
            type: 'object',
            required: ['alg', 'kid'],
            properties: {
              alg: {
                type: 'string'
              },
              kid: {
                type: 'string'
              },
              epk: {
                type: 'object'
              },
              apu: {
                type: 'string'
              },
              apv: {
                type: 'string'
              }
            }
          },
          encrypted_key: {
            type: 'string'
          }
        }
      }]
    },
    iv: {
      type: 'string'
    },
    ciphertext: {
      type: 'string'
    },
    tag: {
      type: 'string'
    }
  }
};

const indexedEntry = {
  title: 'EDV Indexed Entry',
  type: 'object',
  required: ['hmac', 'sequence', 'attributes'],
  additionalProperties: false,
  properties: {
    hmac: {
      type: 'object',
      required: ['id', 'type'],
      additionalProperties: false,
      properties: {
        id: {
          type: 'string'
        },
        type: {
          type: 'string'
        }
      }
    },
    sequence: {
      type: 'integer',
      minimum: 0
    },
    attributes: {
      type: 'array',
      items: [{
        type: 'object',
        required: ['name', 'value'],
        additionalProperties: false,
        properties: {
          name: {
            type: 'string'
          },
          value: {
            type: 'string'
          },
          unique: {
            type: 'boolean'
          }
        }
      }]
    }
  }
};

const edvDocument = {
  title: 'EDV Document',
  type: 'object',
  required: ['id', 'sequence', 'jwe'],
  additionalProperties: false,
  properties: {
    id: {
      type: 'string'
    },
    sequence: {
      type: 'integer',
      minimum: 0
    },
    indexed: {
      type: 'array',
      items: [indexedEntry]
    },
    jwe,
    stream: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sequence: {
          type: 'integer',
          minimum: 0
        },
        chunks: {
          type: 'integer',
          minimum: 1
        }
      }
    }
  }
};

const edvDocumentChunk = {
  title: 'EDV Document Chunk',
  type: 'object',
  required: ['index', 'jwe', 'offset', 'sequence'],
  additionalProperties: false,
  properties: {
    index: {
      type: 'integer',
      minimum: 0
    },
    jwe,
    offset: {
      type: 'integer',
      minimum: 0
    },
    sequence: {
      type: 'integer',
      minimum: 0
    }
  }
};

const postQuery = {
  title: 'EDV Document Query',
  type: 'object',
  required: ['index'],
  anyOf: [
    {required: ['equals']},
    {required: ['has']}
  ],
  additionalProperties: false,
  properties: {
    index: {
      type: 'string'
    },
    count: {
      title: 'EDV Query Count',
      type: 'boolean'
    },
    equals: {
      type: 'array',
      minItems: 1,
      items: [{
        type: 'object',
        // items will be `key: value` pairs where values are strings but
        // keys are free-form
      }]
    },
    has: {
      type: 'array',
      minItems: 1,
      items: [{
        type: 'string'
      }]
    }
  }
};

const getEdvsQuery = {
  title: 'edv query',
  type: 'object',
  required: ['controller', 'referenceId'],
  additionalProperties: false,
  properties: {
    controller: {
      type: 'string'
    },
    referenceId: {
      type: 'string'
    }
  }
};

const getAuthorizationsQuery = {
  title: 'authorization query',
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: {
    id: {
      type: 'string'
    },
  }
};

const zcap = {
  title: 'zcap',
  type: 'object',
  additionalProperties: false,
  properties: {
    id: {
      title: 'id',
      type: 'string'
    },
    allowedAction: {
      anyOf: [{
        type: 'string'
      }, {
        type: 'array',
        minItems: 1,
        items: {type: 'string'}
      }]
    },
    caveat: {
      title: 'Caveat',
      type: 'object'
    },
    '@context': {
      title: '@context',
      anyOf: [{
        type: 'string'
      }, {
        type: 'array',
        minItems: 1,
        items: {type: 'string'}
      }]
    },
    controller: {
      title: 'controller',
      type: 'string'
    },
    delegator: {
      anyOf: [{
        type: 'string'
      }, {
        type: 'array',
        minItems: 1,
        items: {type: 'string'}
      }]
    },
    invoker: {
      anyOf: [{
        type: 'string'
      }, {
        type: 'array',
        minItems: 1,
        items: {type: 'string'}
      }]
    },
    invocationTarget: {
      title: 'Invocation Target',
      anyOf: [{
        type: 'string'
      }, {
        type: 'object',
        properties: {
          id: {
            title: 'Invocation Target Id',
            type: 'string'
          },
          type: {
            title: 'Invocation Target Type',
            type: 'string'
          }
        }
      }]
    },
    parentCapability: {
      title: 'Parent Capability',
      type: 'string'
    },
    proof: {
      title: 'Proof',
      type: 'object'
    },
    referenceId: {
      title: 'Reference Id',
      type: 'string'
    }
  }
};

module.exports = {
  config: () => edvConfig,
  chunk: () => edvDocumentChunk,
  document: () => edvDocument,
  postQuery: () => postQuery,
  getEdvsQuery: () => getEdvsQuery,
  zcap: () => zcap,
  getAuthorizationsQuery: () => getAuthorizationsQuery,
};

