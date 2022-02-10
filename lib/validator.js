/*!
 * Copyright (c) 2019-2022 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const validation = require('bedrock-validation');

exports.validate = ({bodySchema, querySchema}) => {
  if(!(bodySchema || querySchema)) {
    throw new TypeError(
      'One of the following parameters is required: ' +
      '"bodySchema", "querySchema".');
  }
  // pre-compile schemas
  let validateBodySchema;
  if(bodySchema) {
    validateBodySchema = validation.compile(bodySchema);
  }
  let validateQuerySchema;
  if(querySchema) {
    validateQuerySchema = validation.compile(querySchema);
  }
  return (req, res, next) => {
    if(validateBodySchema) {
      const result = validateBodySchema(req.body);
      if(!result.valid) {
        return next(result.error);
      }
    }
    if(validateQuerySchema) {
      const result = validateQuerySchema(req.query);
      if(!result.valid) {
        return next(result.error);
      }
    }
    next();
  };
};
