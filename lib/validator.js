/*!
 * Copyright (c) 2019-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const validation = require('bedrock-validation');

exports.validate = ({bodySchema, querySchema}) => {
  if(!(bodySchema || querySchema)) {
    throw new TypeError(
      'One of the following parameters is required: ' +
      '"bodySchema", "querySchema".');
  }
  return (req, res, next) => {
    if(bodySchema) {
      const result = validation.validateInstance(req.body, bodySchema);
      if(!result.valid) {
        return next(result.error);
      }
    }
    if(querySchema) {
      const result = validation.validateInstance(req.query, querySchema);
      if(!result.valid) {
        return next(result.error);
      }
    }
    next();
  };
};
