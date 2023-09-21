# bedrock-edv-storage ChangeLog

## 18.0.0 - 2023-09-21

### Changed
- Use `@digitalbazaar/ed25519-signature-2020@5`.
- Use `cidr-regex@4`. This version is pure ESM.
- **BREAKING**: Update peer deps:
  - Use `@bedrock/did-context@5`. This version requires Node.js 18+.
  - Use `@bedrock/jsonld-document-loader@4`. This version requires Node.js 18+.
  - Use `@bedrock/meter-usage-reporter@9`. This version requires Node.js 18+.
  - Use `@bedrock/security-context@8`. This version requires Node.js 18+.
  - Use `@bedrock/veres-one-context@15`. This version requires Node.js 18+.
- Update test deps.

## 17.0.0 - 2023-08-28

### Changed
- **BREAKING**: Drop support for Node.js <= 16.
- **BREAKING**: Update `@bedrock/did-io` peer dependency to v10.1.

## 16.2.4 - 2022-12-12

### Fixed
- Fix call to remove pending config record.

## 16.2.3 - 2022-12-12

### Fixed
- Fix `projection` in reference ID mapping queries.

## 16.2.2 - 2022-12-06

### Changed
- Ensure `referenceId` cannot be changed to avoid conflicts.

## 16.2.1 - 2022-12-06

### Fixed
- Ensure `meta` is retrieved from records when aggregating storage costs.

## 16.2.0 - 2022-12-06

### Changed
- The combination of a `controller` and a `referenceId` is no longer enforced
  via a unique index, but is instead enforced via code. This means that using
  a `referenceId` when creating an EDV may slow down its creation. The use of
  `referenceId` is now discouraged; it is a correlator that should not be
  given to the server and should instead be maintained on the client. Clients
  are recommended to have a policy whereby EDV instances are tracked locally
  and that enables the detection of unlocally-mapped EDV instances for
  subsequent garbage collection. This change is considered backwards
  compatible. New database collections are created and the unique index is
  no longer created. Systems that have that index should remove it if they
  want to be able to shard, but otherwise it is not expected to create a
  problem.

## 16.1.0 - 2022-10-10

### Changed
- Allow json bodies to be more than just Arrays or Objects.

## 16.0.0 - 2022-06-30

### Changed
- **BREAKING**: Require Node.js >=16.
- Update dependencies.
- **BREAKING**: Update peer dependencies
  - `@bedrock/app-identity@4`
  - `@bedrock/did-io@9`
  - `@bedrock/meter-usage-reporter@8`
  - `@bedrock/zcap-storage@8`
- Test on Node.js 18.x.
- Use `package.json` `files` field.
- Lint module.

### Added
- Support IPv6 CIDRs in `ipAllowList`.
  - Switching from `netmask` to `ipaddr.js` to support IPv6.

## 15.2.0 - 2022-05-19

### Added
- Add max age header for CORS, defaulting to the max acceptable time for
  modern browsers of 86400 seconds (24 hours).

## 15.1.0 - 2022-05-13

### Added
- Include full error as non-public cause in onError handler.

## 15.0.0 - 2022-04-29

### Changed
- **BREAKING**: Update peer deps:
  - `@bedrock/core@6`
  - `@bedrock/app-identity@3`
  - `@bedrock/did-context@4`
  - `@bedrock/did-io@8`
  - `@bedrock/express@8`
  - `@bedrock/meter-usage-reporter@7`
  - `@bedrock/mongodb@10`
  - `@bedrock/security-context@7`
  - `@bedrock/validation@7`
  - `@bedrock/veres-one-context@14`
  - `@bedrock/zcap-storage@7`.

## 14.0.0 - 2022-04-05

### Changed
- **BREAKING**: Rename package to `@bedrock/edv-storage`.
- **BREAKING**: Convert to module (ESM).
- **BREAKING**: Remove default export.
- **BREAKING**: Require node 14.x.

### Removed
- **BREAKING**: Remove deprecated unnamespaced API; use broken out `edvs`,
  `docs`, `chunks` APIs (e.g., `insertConfig` => `edvs.insert`,
  `insert` => `docs.insert`, `updateChunk` => `chunks.update`).

## 13.1.0 - 2022-03-29

### Changed
- Update peer deps:
  - `bedrock@4.5`
  - `bedrock-did-context@2.1`
  - `bedrock-express@6.4.1`
  - `bedrock-jsonld-document-loader@1.3`
  - `bedrock-mongodb@8.5`
  - `bedrock-security-context@5.1`
  - `bedrock-validation@5.6.3`
  - `bedrock-veres-one-context@12.1`
  - `bedrock-zcap-storage@5.2`.

### Removed
- Remove unused peer deps:
  - `bedrock-server`.
- Update internals to use esm style and use `esm.js` to
  transpile to CommonJS.

## 13.0.0 - 2022-03-11

### Added
- Add `config.authorizeZcapInvocationOptions` to allow configuration of
  `authorizeZcapInvocation` middleware in `ezcap-express`.

### Changed
- **BREAKING**: Make default TTL for zcaps 1 year.

## 12.0.0 - 2022-03-01

### Changed
- **BREAKING**: Move zcap revocations to `/zcaps/revocations` to better
  future proof.
- **BREAKING**: Use `@digitalbazaar/ezcap-express@6`.
- **BREAKING**: This version is compatible with `@digitalbazaar/edv-client@13`.

## 11.5.3 - 2022-02-15

### Fixed
- Apply `10mb` limit to HTTP payloads. Previous limit was erroneously 8kb.

## 11.5.2 - 2022-02-13

### Fixed
- Require safe integers for chunk indexes, offsets, and sequences.

## 11.5.1 - 2022-02-12

### Changed
- Improve internal implementation of JSON schema validators.

## 11.5.0 - 2022-02-10

### Changed
- Use `bedrock-did-io@6`.

## 11.4.0 - 2022-02-10

### Added
- Use `bedrock-validation@5.4` with better JSON schema compilation.

## 11.3.1 - 2022-02-08

### Fixed
- Fix `getTotalSize()` functions to return a size of `0` when
  the databases are empty.

## 11.3.0 - 2022-02-08

### Changed
- Use updated bedrock-veres-one-context@12.

## 11.2.0 - 2022-02-05

### Added
- Support `limit` in queries.

## 11.1.0 - 2022-01-31

### Added
- Expose query endpoint at `/documents/query` to enable zcaps with
  an invocation target of `/documents` to query.

## 11.0.2 - 2022-01-25

### Fixed
- Fix bad thrown exception when the same chunk is updated concurrently.

## 11.0.1 - 2022-01-20

### Fixed
- Do not expose details from errors that are not marked public.

## 11.0.0 - 2022-01-11

### Added
- Support IP-based restrictions on accessing EDVs. If an `ipAllowList`
  is included in an EDV config then only requests from IPs that match
  the list will be granted access.

### Changed
- **BREAKING**: Use ezcap-express@5. These changes include major breaking
  simplifications to ZCAP (zcap@7).

## 10.2.0 - 2021-11-23

### Added
- Do not allow zcap revocations to be stored if the meter associated with
  an EDV has been disabled. Storage of zcap revocations is permitted if
  there is no available storage to prevent potential security issues, however,
  the meter MUST not be disabled to make use of this feature. Very robust
  rate limiting MUST be applied to the revocation submission endpoint in
  a deployment to avoid significant storage overflow.

## 10.1.1 - 2021-11-22

### Fixed
- Fixed error message when a configuration update fails.
- Fixed minor documentation typos.

## 10.1.0 - 2021-11-12

### Added
- Added optional `explain` param to get more details about database performance.
- Added database tests in order to check database performance.

## 10.0.0 - 2021-09-02

### Added
- **BREAKING** - Add storage and operation metering support. A meter ID
  must be provided to create a new keystore. This meter ID will be used to
  report keystore storage and operation usage to the associated meter.
- Added namespaced `edvs`, `docs`, and `chunks` API exports for accessing
  storage (e.g., `edvs.get` will return an EDV config). The older storage
  functions that were namespaced within the function name (e.g., `getConfig`)
  are deprecated.
- Requires bedrock-app-identity to configure the identity for edv
  applications.

### Changed
- **BREAKING**: Simplify zcap revocation model. Now any party that has been
  delegated a zcap can send it to a revocation address:
  `<edvId>/revocations/<zcap ID>` without needing to have an additional zcap
  delegated to that party. The party must invoke the root zcap for that
  endpoint, which will be dynamically generated and use the delegator of the
  zcap as the controller, i.e., the delegator must invoke this root zcap to
  revoke the zcap they delegated.
- **BREAKING**: This version of the module presumes that there will be only
  one public address for accessing EDVs, i.e., the base URL (including the
  origin) will be the same for every EDV stored. This assumption allows for
  some storage optimizations.
- **BREAKING**: The database storage model has changed and is incompatible
  with previous versions. There is no auto-migration built into this version.
- Use ezcap-express to provide zcap revocation authorization implementation.
  Remove dependencies that are no longer needed because of this upgrade.

### Removed
- **BREAKING**: Removed deprecated `fields` option from `storage.find` APIs.
  Use `options.projection` instead.
- **BREAKING**: This module's JSON schema validators are no longer registered;
  they should not be modified.

## 9.0.4 - 2021-08-19

### Fixed
- Use bedrock-did-io@4.

## 9.0.3 - 2021-08-19

### Fixed
- Update dependencies to resolve multicodec key bugs with 2020 suites.

## 9.0.2 - 2021-07-19

### Fixed
- Throw error (a typo previously just returned it) when `updateConfig` fails.

## 9.0.1 - 2021-06-08

### Fixed
- Unset `uniqueAttributes` if cleared in a document update.

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
