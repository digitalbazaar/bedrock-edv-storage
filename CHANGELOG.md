# bedrock-edv-storage ChangeLog

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
