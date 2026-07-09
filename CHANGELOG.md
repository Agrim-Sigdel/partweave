# Changelog

All notable changes to **partweave** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Versions refer
to the [`partweave`](https://www.npmjs.com/package/partweave) npm package.

## [Unreleased]

## [0.3.1] — 2026-07-09

### Changed
- **License: MIT → Apache-2.0.** Adds an explicit patent grant and stronger warranty/liability
  disclaimers, and reserves the "partweave" trademark. Added a `NOTICE` file (propagated to
  redistributions per Apache §4d).
- Expo/React Native hoisting config moved from a generated `.npmrc` into `pnpm-workspace.yaml`
  (pnpm 10.6+), so running `npm run <task>` on a pnpm project no longer warns about unknown
  config keys.

### Added
- Generated pnpm projects now acknowledge known-benign deprecated **transitive** dependencies
  (from Expo/React Native and the jsdom-based test runners) via
  `pnpm.allowedDeprecatedVersions`, so `pnpm install` no longer prints a deprecation summary
  for packages we don't control. Pinned to the observed majors so genuinely new deprecations
  still surface.
- Metro `blockList` in the mobile template keeps `*.test`/`__tests__` files out of the native
  bundle (they no longer get pulled into Expo Router's `require.context`).
- Project governance & docs: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`,
  `AGENTS.md` (guide for AI coding agents), GitHub issue/PR templates, and this changelog.

## [0.3.0] — 2026-07-09

### Added
- Cross-platform task runner (`scripts/run.mjs`): every task works on macOS, Linux, and
  Windows; `make` and `npm run` both delegate to it.
- Package-manager fallback and a `partweave doctor` command to check the environment and
  install missing package managers.

### Fixed
- Expo mobile build issues (peer dependencies and Metro monorepo resolution).

## [0.2.0] — 2026-07-08

### Added
- Leaner npm tarball via an explicit `files` allowlist / `.npmignore`, so the published CLI
  ships only what it needs.

### Changed
- **Renamed the project to `partweave`** (from `quick-build`).

### Fixed
- Critical fix: the Django `SECRET_KEY` is now generated per project and env-driven rather
  than shipped as a static value; server configuration is fully environment-driven.

## [0.1.1] — 2026-07-08

- Initial published release (under the former `quick-build` name).

[Unreleased]: https://github.com/Agrim-Sigdel/partweave/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/Agrim-Sigdel/partweave/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/Agrim-Sigdel/partweave/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Agrim-Sigdel/partweave/releases/tag/v0.2.0
[0.1.1]: https://github.com/Agrim-Sigdel/partweave/releases/tag/v0.1.1
