# AGENTS.md

Operating guide for AI coding agents working in this repository. Humans: see
[CONTRIBUTING.md](CONTRIBUTING.md) — this file is the terse, command-first version.

## What this project is

partweave is a **code generator**, published to npm as `partweave`. The CLI in
`packages/cli` reads a catalog of template modules under `modules/` and assembles a monorepo
containing only the apps/components a user selects. **The product's real output is the
*generated project*, not the CLI** — so a change isn't "done" until a freshly scaffolded
project still installs, typechecks, and tests clean.

## Golden rules

- Prefer adding a **module** (`modules/<id>/module.json` + files) over touching the engine.
  If you find yourself editing `src/engine.ts`, `resolve.ts`, or `render.ts`, stop and
  reconsider — the module contract can usually express it.
- **Generated code must be cross-platform** (macOS/Linux/Windows). Never emit shell `&&`/`cd`
  in generated scripts; go through `scripts/run.mjs`'s structured-argv `run()` helper.
- **Never hard-code a package manager** in templates. Use the abstraction in
  [`packages/cli/src/pm.ts`](packages/cli/src/pm.ts) (pnpm/npm, uv/pip).
- **Comments explain _why_, not _what_.** Match the existing density; don't add restatement.
- Keep the published tarball lean — only `dist/`, `modules/`, and `README`
  ship (see the `files` array in `packages/cli/package.json`).
- Don't commit `dist/` — it's built at `prepack`. Don't edit files under `modules/` expecting
  them to run locally; they are *template source* copied into generated projects.

## Setup

```sh
pnpm install                      # generator's own deps (Node >= 20, pnpm via corepack)
pnpm --filter partweave build     # compile CLI → packages/cli/dist/
```

## Everyday commands

```sh
pnpm --filter partweave typecheck   # tsc --noEmit on the generator
pnpm --filter partweave test        # vitest unit tests (engine + rootgen)
pnpm --filter partweave build       # rebuild after changing src/ before scaffolding
```

Run the local CLI:

```sh
node packages/cli/dist/index.js create demo --dir /tmp/demo --web --mobile --yes
# flags: --server/--no-server --web/--no-web --mobile/--no-mobile
#        --with <ids>   (e.g. auth,db-postgres,docker,ci,storage,example)
#        --js-pm pnpm|npm   --py-pm uv|pip   --yes   --force
```

## The verification that actually matters

After any change to the generator or templates, **rebuild, scaffold a real project, and run
its checks** — this is what CI gates on:

```sh
pnpm --filter partweave build
node packages/cli/dist/index.js create app --dir /tmp/app \
  --server --web --mobile --with auth,example --yes
cd /tmp/app && pnpm install && pnpm -r typecheck && pnpm -r test
```

For server changes also: `cd apps/server && uv sync && uv run pytest -q` (needs Postgres for
some suites — CI uses a `postgres:16` service).

## Project layout

```
packages/cli/src/
  index.ts          CLI entry (commander) + create/add/doctor
  commands/         one file per command
  engine.ts         selection → modules → files (registry/resolve/render/inject)
  compose.ts        orchestrates a full generation run
  rootgen.ts        builds the monorepo shell (root package.json, pnpm-workspace.yaml,
                    scripts/run.mjs, Makefile, CI workflows, README, Dockerfile, .env)
  pm.ts             package-manager abstraction (pnpm/npm, uv/pip)
modules/_core/      base apps: server, web, mobile, shared, api-client
modules/<id>/       optional components, each with a module.json manifest
docs/               module-contract.md, authoring-a-module.md, feature-catalog.md, …
```

## Adding a component

1. Create `modules/<id>/module.json` — see [`docs/module-contract.md`](docs/module-contract.md)
   for every field (id, title, apps it targets, deps, files, wiring/injections).
2. Add the template files next to it.
3. Declare deps on other components/apps in the manifest; the resolver pulls them in and
   reports incompatible selections (e.g. `auth` needs the server app).
4. Add/extend a test that scaffolds a project including the component and asserts it's green.
5. Update [`docs/feature-catalog.md`](docs/feature-catalog.md) if relevant.

Full walkthrough: [`docs/authoring-a-module.md`](docs/authoring-a-module.md).

## Commit conventions

Imperative, scoped subjects: `feat: add storage component`, `fix: align web on React 19`,
`docs: …`, `ci: …`, `chore: …`. One logical change per commit/PR. Keep
[`CHANGELOG.md`](CHANGELOG.md)'s `[Unreleased]` section updated as you go.

## Releasing / publishing

Publishing is automated by [`.github/workflows/publish.yml`](.github/workflows/publish.yml) via
npm **Trusted Publishing (OIDC)** — no token, no OTP. A push of a `v*` tag runs the CI gate
(generates real projects and tests them) and only then publishes. **The tag must exactly match
`packages/cli/package.json`'s version** or the run fails fast.

```sh
# 1. bump (no auto-tag — we tag explicitly). Run INSIDE packages/cli, not with
#    `npm version --workspace` from the root: on a pnpm repo the latter makes npm
#    try to resolve the whole .pnpm tree and errors out (it still writes the new
#    version first, but the noise is alarming). pnpm exec runs it in the package dir.
pnpm --filter partweave exec npm version patch --no-git-tag-version   # patch | minor | major

# 2. move CHANGELOG [Unreleased] → the new version, then commit
git add -A
git commit -m "Release partweave X.Y.Z — <summary>"

# 3. tag + push → CI gate → publish
git tag -a vX.Y.Z -m "X.Y.Z"
git push origin main --follow-tags
```

Do **not** run `npm publish` locally — publishing goes through CI/OIDC only. Never add an
`NPM_TOKEN` secret; it isn't used.

## Gotchas

- `packages/cli/dist/` is stale until you `build` — always rebuild before scaffolding to test
  a source change.
- `bundle-modules.mjs` copies `modules/` + `README` into `packages/cli/` at
  `prepack` and removes them at `postpack`. If a `packages/cli/modules/` dir is lying around,
  it shadows the repo-root catalog on local runs — clean it with
  `node packages/cli/scripts/bundle-modules.mjs --clean`.
- Mobile (Expo) needs a hoisted node_modules layout; that's emitted into the generated
  `pnpm-workspace.yaml` (`nodeLinker: hoisted`), not an `.npmrc`.
- Some deprecated **transitive** deps (from Expo/RN and jsdom test runners) are intentionally
  acknowledged via `pnpm.allowedDeprecatedVersions` in the generated root `package.json` —
  don't try to "fix" them by force-upgrading; they resolve when those frameworks update.
