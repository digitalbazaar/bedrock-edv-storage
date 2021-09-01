/*!
 * Copyright (c) 2018-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const controller = {
  title: 'controller',
  type: 'string'
};

const referenceId = {
  title: 'referenceId',
  type: 'string'
};

const delegator = {
  anyOf: [{
    type: 'string'
  }, {
    type: 'array',
    minItems: 1,
    items: {type: 'string'}
  }]
};

const invoker = {
  anyOf: [{
    type: 'string'
  }, {
    type: 'array',
    minItems: 1,
    items: {type: 'string'}
  }]
};

const edvConfig = {
  title: 'EDV Configuration',
  type: 'object',
  required: ['controller', 'sequence', 'keyAgreementKey', 'hmac', 'meterId'],
  additionalProperties: false,
  properties: {
    id: {
      type: 'string'
    },
    controller: {
      type: 'string'
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
    },
    meterId: {
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

const edvDocumentQuery = {
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

const delegatedZcap = {
  title: 'delegatedZcap',
  type: 'object',
  additionalProperties: false,
  required: ['id', 'parentCapability', 'invocationTarget', 'proof'],
  anyOf: [{
    required: ['controller']
  }, {
    required: ['delegator']
  }, {
    required: ['invoker']
  }],
  properties: {
    controller,
    invoker,
    delegator,
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
    expires: {
      // FIXME: w3c datetime
      title: 'expires',
      type: 'string'
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
    invocationTarget: {
      title: 'Invocation Target',
      anyOf: [{
        type: 'string'
      }, {
        type: 'object',
        required: [
          'type', 'id'
        ],
        additionalProperties: false,
        properties: {
          id: {
            title: 'Invocation Target Id',
            type: 'string'
          },
          type: {
            title: 'Invocation Target Type',
            type: 'string'
          },
          controller: {
            title: 'controller',
            type: 'string'
          },
          // was: verificationMethod
          publicAlias: {
            title: 'publicAlias',
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
      type: 'object',
      additionalProperties: false,
      required: [
        'verificationMethod', 'type', 'created', 'proofPurpose',
        'capabilityChain', 'proofValue'
      ],
      properties: {
        verificationMethod: {
          title: 'verificationMethod',
          type: 'string'
        },
        type: {
          title: 'type',
          type: 'string'
        },
        created: {
          title: 'created',
          type: 'string'
        },
        proofPurpose: {
          title: 'proofPurpose',
          type: 'string'
        },
        capabilityChain: {
          title: 'capabilityChain',
          type: 'array',
          minItems: 1,
          items: {
            type: ['string', 'object']
          }
        },
        proofValue: {
          title: 'proofValue',
          type: 'string'
        },
      }
    },
    referenceId
  }
};

module.exports = {
  config: edvConfig,
  chunk: edvDocumentChunk,
  document: edvDocument,
  postConfigBody: edvConfig,
  postChunkBody: edvDocumentChunk,
  postDocumentBody: edvDocument,
  postDocumentQueryBody: edvDocumentQuery,
  getConfigsQuery: getEdvsQuery,
  postRevocationBody: {...delegatedZcap}
};
