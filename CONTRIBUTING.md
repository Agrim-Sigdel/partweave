# Contributing to partweave

Thanks for your interest in improving partweave! This project is a **code generator**: the
CLI reads a catalog of template modules and assembles a monorepo containing only the parts a
user selects. That shape drives everything below.

By participating you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug** — open an issue with the exact command you ran and what the generated
  project did. See the bug template.
- **Request a component or app** — check [`docs/feature-catalog.md`](docs/feature-catalog.md)
  first; it lists what's planned and prioritized.
- **Add a component** — a new folder under `modules/` with a `module.json`. No engine
  changes needed. This is the highest-leverage contribution; see below.
- **Improve docs** — the `docs/` folder is the source of truth for how the generator works.

## Project layout

```
packages/cli/          The generator (published to npm as `partweave`)
  src/
    index.ts           CLI entry (commander) + `create` / `add` / `doctor` commands
    commands/          One file per command
    engine.ts*         Resolves selection → modules → files (see registry/resolve/render)
    compose.ts         Orchestrates a full generation run
    rootgen.ts         Builds the monorepo shell (package.json, workspace, runner, CI, …)
    pm.ts              Package-manager abstraction (pnpm/npm, uv/pip)
  scripts/             prepack bundling (copies modules/ + README/LICENSE)
modules/               The template catalog — this is the product's content
  _core/               Base apps (server, web, mobile, shared, api-client)
  <component>/         Optional components, each with a module.json manifest
docs/                  Deep docs: module contract, authoring guide, feature catalog
.github/workflows/     CI (generate-and-test gate) + npm publish (OIDC)
```

Read [`docs/module-contract.md`](docs/module-contract.md) to understand `module.json`, and
[`docs/authoring-a-module.md`](docs/authoring-a-module.md) for a step-by-step walkthrough of
adding a component.

## Development setup

Prerequisites: **Node ≥ 20** and **pnpm** (`corepack enable pnpm`). Some generated projects
also use **Python 3.12+** with **uv**, but you only need those to run a scaffolded server.

```sh
pnpm install                       # install the generator's own deps
pnpm --filter partweave build      # compile the CLI (tsup → dist/)
```

Run the local CLI against a throwaway directory:

```sh
node packages/cli/dist/index.js create demo --dir /tmp/demo --web --mobile --yes
# or, in watch mode while developing the engine:
pnpm --filter partweave dev
```

The generator finds the module catalog by walking up to `modules/`. Override with
`PARTWEAVE_MODULES_DIR=/path/to/modules` if needed.

## Checks — run these before opening a PR

```sh
pnpm --filter partweave typecheck   # tsc --noEmit on the generator
pnpm --filter partweave test        # vitest unit tests (engine + rootgen)
```

Because partweave's real output is *generated projects*, the most important check is that a
freshly scaffolded project is green. CI does this for you (see below), but you can reproduce
it locally:

```sh
node packages/cli/dist/index.js create app --dir /tmp/app \
  --server --web --mobile --with auth,example --yes
cd /tmp/app && pnpm install && pnpm -r typecheck && pnpm -r test
```

### What CI enforces

Every push and PR runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml), which:

1. Builds the generator.
2. Scaffolds a **full server + web + mobile** project and a **server + web** project.
3. Runs the generated projects' `typecheck`, unit tests, web production build, and server
   `pytest` (against Postgres).

A release is **blocked** unless that gate is green — a broken template can't be published.

## Adding a component (the common case)

1. Create `modules/<your-id>/module.json` (see the contract doc for every field).
2. Add the component's template files alongside it.
3. Declare dependencies on other components/apps in the manifest — the resolver adds them
   automatically and reports incompatible selections.
4. Add a test that generates a project including your component and asserts it typechecks/runs.
5. Update [`docs/feature-catalog.md`](docs/feature-catalog.md) if relevant.

No changes to the engine should be necessary — if you find yourself editing `engine.ts`,
open an issue first so we can discuss whether the contract needs to grow.

## Coding conventions

- **TypeScript, strict.** No `any` escapes without a comment explaining why.
- **Comments explain _why_, not _what_.** This codebase favors a short rationale over a
  restatement of the code. Match that; don't add noise.
- **Generated code must be cross-platform** (macOS, Linux, Windows): no shell `&&`/`cd` in
  emitted scripts — use `scripts/run.mjs`'s structured-argv `run()` helper.
- **Templates stay package-manager-agnostic**: honor the pnpm/npm and uv/pip abstractions in
  [`pm.ts`](packages/cli/src/pm.ts) rather than hard-coding a tool.
- Keep the published tarball lean — only `dist/`, `modules/`, and the license/readme ship.

## Commit & PR guidelines

- Write imperative, scoped commit subjects: `fix: align web on React 19`, `feat: add
  storage component`, `docs: …`, `ci: …`, `chore: …`.
- One logical change per PR. Include the command you ran and the observed result.
- Green `typecheck` + `test` + a clean generated project are required to merge.
- By contributing you agree your contributions are licensed under the project's
  [MIT License](LICENSE).

## Releasing (maintainers)

Publishing is automated via [`.github/workflows/publish.yml`](.github/workflows/publish.yml)
using npm **Trusted Publishing (OIDC)** — no token or OTP. The tag must match the version in
`packages/cli/package.json` or the run fails fast.

```sh
# Bump inside the package dir (pnpm exec) — NOT `npm version --workspace` from the
# root, which errors on the pnpm workspace tree.
pnpm --filter partweave exec npm version patch --no-git-tag-version
git commit -am "Release X.Y.Z"
git tag -a vX.Y.Z -m "X.Y.Z"
git push origin main --follow-tags                             # tag → CI gate → publish
```

Update [`CHANGELOG.md`](CHANGELOG.md) in the same release commit.

---

Questions? Open an issue — we're happy to help you land your first contribution.
