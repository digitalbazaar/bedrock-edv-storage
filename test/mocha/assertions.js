/*!
 * Copyright (c) 2018-2022 Digital Bazaar, Inc. All rights reserved.
 */
export function shouldBeCapability({capability}) {
  should.exist(capability);
  capability.should.be.an('object');
  should.exist(capability.id);
  should.exist(capability['@context']);
  should.exist(capability.proof);
}

export function shouldBeEdvConfig({config}) {
  should.exist(config);
  config.should.have.property('id');
  config.should.have.property('sequence');
  config.should.have.property('controller');
  config.should.have.property('keyAgreementKey');
  config.should.have.property('hmac');
  config.should.have.property('meterId');
}

export function shouldBeEdvDocument({doc}) {
  should.exist(doc);
  // not a comprehensive list
  doc.should.have.property('id');
  doc.should.have.property('sequence');
  doc.should.have.property('indexed');
  doc.indexed.should.be.an('array');
  doc.should.have.property('content');
}
