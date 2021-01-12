# bedrock-edv-storage ChangeLog

## 5.3.0 - 2021-01-12

### Changed
- Update bedrock-account@5.0.

## 5.2.0 - 2020-12-10

### Changed
- Adjust document schema to accept stream information from edv-client `>=7.0.0`.

## 5.1.0 - 2020-09-28

### Changed
- Use did-method-key@0.7.0.
- Update peer and test deps.

## 5.0.0 - 2020-09-23

### Changed
- **BREAKING**: Move delete method client-side.

## 4.1.1 - 2020-07-01

### Fixed
- Fix MongoDB collection calls that involve the projection API.

## 4.1.0 - 2020-06-30

### Changed
- Update peerDependencies to include bedrock-account@4.
- Update test deps.
- Update CI workflow.

## 4.0.0 - 2020-06-23

### Changed
- **BREAKING**: The query endpoint now returns an object `{documents: [...]}`
  instead of only an array of documents.
- **BREAKING**: Changed validation around the upper bounds of
  `document.sequence`.

## 3.0.0 - 2020-06-09

### Changed
- **BREAKING**: Upgrade to `bedrock-mongodb` ^7.0.0.
- Change methods to use mongo 3.5 driver api.

### Added
- Find methods now accept options.projections.
- Find parameter fields is now optional.
- If options.projections & fields are passed in find will throw.

## 2.2.0 - 2020-06-04

### Added
- Implement a `count` API for returning the number of documents matching a
  query.

## 2.1.0 - 2020-05-15

### Changed
- Add support for `did:v1` resolution.

## 2.0.0 - 2020-04-02

### Changed
- **BREAKING**: Use ocapld@2.
- **BREAKING**: Use http-signature-zcap-verify@3.

## 1.3.0 - 2020-03-04

### Added
- Implement zCap auth in `findConfig` API.

## 1.2.1 - 2020-03-03

### Fixed
- Fix `baseUri` calculation.

## 1.2.0 - 2020-03-03

### Added
- HTTP revocations API.

### Changed
- Update dependencies.

## 1.1.3 - 2020-01-12

### Fixed
- Ensure local zcap storage is checked for invoked zcaps.

## 1.1.2 - 2020-01-12

### Fixed
- Ensure local zcap storage is checked for parent zcaps.

## 1.1.1 - 2020-01-11

### Fixed
- Fix CORS support for queries.

## 1.1.0 - 2020-01-10

### Added
- Support zcaps for document collections and delegation by non-root
  controllers provided that `delegator` is set in the zcap.

## 1.0.0 - 2019-09-05

### Added
- Added core files.
- Renamed from bedrock-data-hub-storage.

- See git history for changes.
