# Bedrock Encrypted Data Vault Storage _(@bedrock/edv-storage)_

[![Build Status](https://img.shields.io/github/actions/workflow/status/digitalbazaar/bedrock-edv-storage/main.yaml)](https://github.com/digitalbazaar/bedrock-edv-storage/actions/workflows/main.yaml)
[![NPM Version](https://img.shields.io/npm/v/@bedrock/edv-storage.svg)](https://npm.im/@bedrock/edv-storage)

> Encrypted Data Vault Storage for Bedrock application.

## Table of Contents

- [Background](#background)
- [Security](#security)
- [Install](#install)
- [Usage](#usage)
- [Test](#test)
- [Contribute](#contribute)
- [Commercial Support](#commercial-support)
- [License](#license)

## Background

TODO

## Security

TBD

## Install

This software requires and supports maintained recent versions of Node.js.
Updates may remove support for older unmaintained platform versions. Please use
dependency version lock files and testing to ensure compatibility with this
software.

### NPM

To install via NPM:

```
npm install --save @bedrock/edv-storage
```

### Development

To install locally (for development):

```
git clone https://github.com/digitalbazaar/bedrock-edv-storage.git
cd bedrock-edv-storage
npm install
```

## Usage

This is a [Bedrock](https://github.com/digitalbazaar/bedrock) module: it does
not run standalone. Importing it into a Bedrock application registers the EDV
HTTP API on the application's Express server and creates the required MongoDB
collections and indexes on startup.

### Application setup

A minimal application imports this module alongside its peer modules and
starts Bedrock (see `test/test.js` for a complete working example, including
the WebKMS and meter services used in development):

```js
import * as bedrock from '@bedrock/core';
import '@bedrock/express';
import '@bedrock/https-agent';
import '@bedrock/meter-usage-reporter';
import '@bedrock/mongodb';
import '@bedrock/server';
import '@bedrock/edv-storage';

bedrock.start();
```

Creating an EDV requires a `meterId` referencing a meter the application can
verify, so a meter service (e.g., `@bedrock/meter` + `@bedrock/meter-http`,
or a remote equivalent) must be available. EDV clients also need a WebKMS to
manage their key agreement and HMAC keys; the server itself never sees key
material.

### Configuration

Defaults live in `lib/config.js` under `bedrock.config['edv-storage']`:

- `routes.basePath`: base path for the HTTP API (default `/edvs`).
- `authorizeZcapInvocationOptions`: zcap verification limits (max
  capability chain length 10, max clock skew 300 seconds, max delegation
  TTL 1 year).
- `storageCost`: storage units reported to the meter service per EDV and
  per revocation.
- `documentCompatibilityVersion`: must be `1`.

The module also seeds a development application identity
(`bedrock.config['app-identity'].seeds.services.edv`) that **must be
overridden in production deployments**.

### HTTP API

All endpoints are CORS-enabled and authorized via zcap (Authorization
Capability) invocation using HTTP signatures; there are no cookies or
sessions. The API serves EDV configs (`POST`/`GET` on the base path and
`/edvs/:edvId`), encrypted documents
(`/edvs/:edvId/documents[/:docId]`), encrypted index queries
(`POST /edvs/:edvId/query`), binary chunks
(`/edvs/:edvId/documents/:docId/chunks/:chunkIndex`), and zcap revocations
(`POST /edvs/:edvId/zcaps/revocations/:revocationId`).

Clients are not expected to call the HTTP API directly; use
[`@digitalbazaar/edv-client`](https://github.com/digitalbazaar/edv-client),
which handles encryption, blinded index generation, and zcap invocation.

### Storage API

The module exports its storage layer for programmatic use within the same
application:

```js
import {chunks, docs, edvs} from '@bedrock/edv-storage';

const {config} = await edvs.get({id: edvId});
const {doc} = await docs.get({edvId, id: docId});
```

Each namespace provides `insert`/`get`/`update` (and related) functions
operating directly on MongoDB, enforcing the same invariants as the HTTP
API (sequence numbers, duplicate detection, unique blinded attributes).

## Test

The test suite runs a full Bedrock application -- an HTTPS server (with a
self-signed certificate) hosting this module's EDV endpoints, plus an
in-process WebKMS and metering service -- and drives it end to end over HTTP,
including via the real `edv-client`.

Requirements:

- Node.js >= 20
- A MongoDB server listening on `localhost:27017` (no authentication). The
  tests use a `bedrock_edv_storage_test` database and drop its collections
  on startup. For example, via Docker:

  ```
  docker run -d -p 27017:27017 mongo:8
  ```

To run the tests:

```
npm install
cd test
npm install
npm test
```

To generate a code coverage report:

```
cd test
npm run coverage
```

## Contribute

See [the contribute file](https://github.com/digitalbazaar/bedrock/blob/master/CONTRIBUTING.md)!

PRs accepted.

If editing the Readme, please conform to the
[standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## Commercial Support

Commercial support for this library is available upon request from
Digital Bazaar: support@digitalbazaar.com

## License

[Bedrock Non-Commercial License v1.0](LICENSE.md) © Digital Bazaar
