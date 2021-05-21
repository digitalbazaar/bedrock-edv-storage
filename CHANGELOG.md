# bedrock-edv-storage ChangeLog

## 9.0.0 - 2021-05-21

### Changed
- Update dependencies.
  - **BREAKING**: Use `ed25519-signature-2020` signature suite.
  - **BREAKING**: Remove `ocapld` and use [@digitalbazaar/zcapld@4.0](https://github.com/digitalbazaar/zcapld/blob/main/CHANGELOG.md). fetchInSecurityContext API uses the new zcap-context.
  - **BREAKING**: Use [http-signature-zcap-verify@7.1.0](https://github.com/digitalbazaar/http-signature-zcap-verify/blob/main/CHANGELOG.md). Uses new zcap-context.
  - **BREAKING**: Use [jsonld-signatures@9.0.2](https://github.com/digitalbazaar/jsonld-signatures/blob/master/CHANGELOG.md)
- Update test deps and peerDeps.

## 8.0.0 - 2021-03-12

### Changed
- **BREAKING**: Use `http-signature-zcap-verify@4`. Includes breaking changes
  related to headers that contain timestamps.
- **BREAKING**: Use `did-veres-one@13`. Includes breaking changes
  related to headers that contain timestamps.

## 7.0.0 - 2021-03-11

### Fixed
- **BREAKING**: Fix incorrectly configured MongoDB index on the `edvConfig`
  collection. If this software needs to be deployed along with an existing
  database, the index named `controller_1_config.referenceId_1` will need to
  be dropped manually. The index will be recreated automatically on Bedrock
  application startup.

### Changed
- Improve test coverage.

## 6.0.0 - 2021-02-08

### Changed
- **BREAKING**: Some property validation error responses have changed.

### Added
- Add validators to endpoints.

## 5.4.0 - 2021-02-08

### Changed
- Use `verifyHeaderValue` middleware to check digest header.

## 5.3.1 - 2021-02-08

### Fixed
- Fix API call to `removeChunk`.

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
