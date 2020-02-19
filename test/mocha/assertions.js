exports.shouldBeCapability = ({capability}) => {
  should.exist(capability);
  capability.should.be.an('object');
  should.exist(capability.id);
  should.exist(capability['@context']);
  should.exist(capability.proof);
};

exports.shouldBeEdvConfig = ({config}) => {
  should.exist(config);
  config.should.have.property('id');
  config.should.have.property('sequence');
  config.should.have.property('controller');
  config.should.have.property('invoker');
  config.should.have.property('delegator');
  config.should.have.property('keyAgreementKey');
  config.should.have.property('hmac');
};

exports.shouldBeEdvDocument = ({doc}) => {
  should.exist(doc);
  // not a comprehensive list
  doc.should.have.property('id');
  doc.should.have.property('sequence');
  doc.should.have.property('indexed');
  doc.indexed.should.be.an('array');
  doc.should.have.property('content');
};
