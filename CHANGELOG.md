# Changelog

All notable changes to **partweave** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Versions refer
to the [`partweave`](https://www.npmjs.com/package/partweave) npm package.

## [Unreleased]

### Module Catalog Changes
- **`rbac`** (New Module): Role-Based Access Control boilerplate with decorators and permission classes.
- **`rate-limit`** (New Module): Throttling presets (Burst/Sustained) for endpoints.
- **`audit-log`** (New Module): Immutable security logging for requests and state changes.


## [0.6.0] - 2026-07-21

### Security
- **Storage path-traversal fix (F21/S0.3).** The `storage` module now validates every
  object key: `..` segments, absolute paths, and drive-letter/UNC keys are rejected
  (`storage.base.safe_key`), and `LocalStorage` additionally asserts the resolved path
  stays inside `MEDIA_ROOT`. Previously a key like `../../etc/x` could escape the media
  root. Applies to the S3 backend too. Guarded by new pytest cases.

### Fixed
- **The published package now ships the module catalog (install was broken for everyone but
  the maintainer).** 0.5.0 moved the catalog to a GitHub clone on first run, but that code
  path never runs in this monorepo — `findModulesDir()` finds the repo-root `modules/` first —
  so it was only ever exercised on users' machines. Any environment where the clone failed
  (no `git` installed, proxy, firewall, offline) got an opaque `Failed to clone registry`,
  and an interrupted clone left a cache that poisoned every later run with
  `Could not locate the modules/ catalog`. The catalog (~50 KB gzipped) now ships inside the
  tarball, so `create` works with no git and no network. `--update` still refreshes from GitHub.
- **Registry fetch hardening** (still used by `--update`): the cache is validated by
  `modules/_core` rather than `.git`, clones stage into a temp dir and are renamed in
  atomically, and git's stderr is surfaced instead of discarded — a missing `git` now says so.
- **`add <app>` no longer clobbers hand-edited root files (F4/S0.4).** When you add an app,
  structural root files (`package.json`, `pnpm-workspace.yaml`, `turbo.json`,
  `tsconfig.base.json`, `scripts/run.mjs`, `Makefile`) are regenerated for the new app set —
  but a file you've edited since the last generation is now preserved: the regenerated
  version is written beside it as `<file>.partweave-new` and a note tells you to reconcile.
  Files you haven't touched (e.g. workspace membership) still update cleanly. Edits are
  detected by diffing against what would have been generated for the previous app set.
- **Generated CI is green on the first push (F2/S0.2).** The pnpm workflow no longer uses
  `--frozen-lockfile` or `cache: pnpm` (both hard-fail when no lockfile has been committed
  yet). Commit the generated `pnpm-lock.yaml` and tighten back for cached, reproducible
  installs.
- **CLI typecheck is clean again.** Fixed pre-existing type errors introduced with the 0.4/0.5
  `extract`/registry features (`Manifest` import, `ErrorKind` taxonomy gained `not-found`/
  `fetch-failed`/`update-failed`, unused import). `extract`'s generated manifest now lists only
  real apps in `requiresApps`.

### Added
- **Pin the module registry for reproducible scaffolds.** `PARTWEAVE_REGISTRY_REF=<branch|tag|commit>`
  freezes the GitHub-fetched catalog to a specific ref (default `main`); each ref is cached
  separately and `--update` refreshes it via fetch + reset (tag-safe).
- Honest single-stack scope caveat in the README.

## [0.5.0] - 2026-07-12
### Added
- **Dynamic Module Registry**: The CLI now fetches modules directly from GitHub (`main` branch) by default, bypassing the NPM release cycle.
- `--update` flag: Force update the remote registry cache before scaffolding or adding modules.
- **Feedback Module**: A full-stack (Django/Next.js/Expo) user feedback module.

## [0.4.0] — 2026-07-12

### Added
- **`partweave extract` command:** Introduced the "Extraction Flow" to allow developers and AI agents to build features natively inside their generated project (e.g., `apps/server/email`), and then easily extract them into a reusable `partweave` module format. The command scaffolds the directory structure and a skeleton `module.json` manifest.

## [0.3.3] — 2026-07-09

### Changed
- **CLI banner refresh.** The wordmark now renders in faux-3D — a woven `█`/`▓` gradient front
  face with a gray extruded side for depth — beside a dim "loom" of interlacing warp/weft
  threads (replacing 0.3.2's flat weave). Same graceful fallbacks: truecolor → basic two-tone
  → plain (the 3D + weave still read by shape) → a one-line fallback on narrow terminals /
  non-TTY.

## [0.3.2] — 2026-07-09

### Added
- **New CLI look.** A pixel `partweave` wordmark with a woven `█`/`▓` texture under a
  violet→magenta→red gradient, plus a cleaner interactive flow and a tidy review box before
  scaffolding. Zero new dependencies; it degrades gracefully — truecolor gradient → basic
  two-tone → plain weave, and a one-line fallback on narrow terminals / non-TTY (CI) — so it
  runs anywhere.
- **Per-app env files, created ready-to-run.** Each app now gets its own env pair in
  the location its framework reads: `apps/server/.env` (Django), `apps/web/.env` (Next.js),
  `apps/mobile/.env` (Expo), and a root `.env` for the database container (docker compose).
  A committed `.env.example` sits beside each; the gitignored `.env` is generated for you so
  the project runs without hand-copying files. The real `DJANGO_SECRET_KEY` lives only in
  `.env`; `.env.example` carries a placeholder. Existing `.env` files are never overwritten.
- **Git initialization.** `partweave create` can `git init` (branch `main`) and make an
  initial commit — prompted interactively, or via `--git` / `--no-git`. Skipped when git
  isn't installed or the target is already inside a repo. `.env` files are gitignored, so
  secrets never land in the commit.

### Changed
- Component env keys now route to the app that consumes them, by prefix: `POSTGRES_*` → root
  infra, `NEXT_PUBLIC_*` → web, `EXPO_PUBLIC_*` → mobile, everything else → server.
- **Engine: deterministic topological module order.** Modules are now emitted in a true
  dependency order (Kahn, ties broken by id) instead of a dep-count heuristic, so injected
  `INSTALLED_APPS`/middleware/providers land in the right order regardless of selection order.
- **Engine: real dependency merge.** JS deps now keep the higher version (semver-max) instead
  of first-wins; Python deps merge into pyproject **by distribution name**, so two components
  can't add conflicting lines for the same package.

### Fixed
- **Engine: anchor-scoped wiring idempotency.** `injectAtAnchor` now dedups within the
  anchor's own block instead of the whole file — fixing silent under-wiring when two components
  legitimately need the same line at different anchors, and keeping `add`/re-runs idempotent.
- The generated dev `.env` no longer pins `DJANGO_ALLOWED_HOSTS`, so with `DEBUG=true` the
  server accepts any host and a phone/simulator can reach it over the LAN. Previously the
  pinned `localhost,127.0.0.1` overrode Django's permissive DEBUG default, causing
  `DisallowedHost` for LAN IPs.

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

[Unreleased]: https://github.com/Agrim-Sigdel/partweave/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/Agrim-Sigdel/partweave/compare/v0.5.0...v0.6.0
[0.3.3]: https://github.com/Agrim-Sigdel/partweave/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/Agrim-Sigdel/partweave/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/Agrim-Sigdel/partweave/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/Agrim-Sigdel/partweave/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Agrim-Sigdel/partweave/releases/tag/v0.2.0
[0.1.1]: https://github.com/Agrim-Sigdel/partweave/releases/tag/v0.1.1
