# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

* * *

## [Unreleased]

## [1.2.0] - 2026-05-06

### Added

- Skills and consolidated AGENTS.md
- Bump org.xerial:sqlite-jdbc from 3.50.3.0 to 3.53.0.0
- Tons of more code coverage

### Fixed

- Normalize `database` values using the `memory:` prefix to SQLite in-memory URIs (`file:<name>?mode=memory&cache=shared`) so they no longer create files on disk.
- Added SQLite driver regression coverage for `memory:<name>`, `memory:<name>;create=true`, and `:memory:` connection URL generation.
- Corrected integration test assertions to use the runtime `Query` API indexing semantics and validate UPDATE/DELETE behavior via SELECT results instead of expecting row payloads from DML results.

## [1.1.0] - 2025-08-04

### Updates

- Updated all github actions
- Updated readme and changelog templates
- Added Github Copilot instructions file

## [1.1.0] - 2025-08-04

### Updates

- Bump org.xerial:sqlite-jdbc from 3.50.1.0 to 3.50.3.0

- Bump Boxlang version from 1.3.0 to 1.4.0

  ### Fixed

- fixes on build process thanks to new module schema

- Integration tests to avoid context caching issues with v1.4

* * *

## [1.0.0] - 2025-06-24

- First iteration of this module

[unreleased]: https://github.com/ortus-boxlang/bx-sqlite/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/ortus-boxlang/bx-sqlite/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ortus-boxlang/bx-sqlite/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ortus-boxlang/bx-sqlite/compare/30d4a11e972f24784ed3bfe42fbfbd7f3a81f2c8...v1.0.0
