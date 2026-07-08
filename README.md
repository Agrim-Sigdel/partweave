# quick-build — a modular full-stack scaffolder

Generate new projects that contain **only the parts you pick** — a Django server, a
Next.js web app, an Expo mobile app, and cross-cutting components (auth, storage, docker,
CI) — all wired together.

It's `create-t3-app` (choose your stack) meets `shadcn/ui` (you own the code that's added,
built on clean, swappable interfaces).

## Install

**Run it directly — no install** (always the latest published version):
```sh
npx @agrimsigdel/quick-build create        # interactive picker
```

**Or install the command globally:**
```sh
npm install -g @agrimsigdel/quick-build
quick-build create            # or use the short alias: qb create
```
> Requires Node ≥ 20. Updates are automatic with `npx`; for the global install run
> `npm update -g @agrimsigdel/quick-build`.

<details>
<summary>Install from source (contributors)</summary>

```sh
git clone git@github.com:Agrim-Sigdel/quick-build.git ~/.quick-build && cd ~/.quick-build
./bin/quick-build create        # the launcher builds itself on first run
```
Or the one-line installer (clones to `~/.quick-build`, builds, drops a `quick-build` /
`qb` command into `~/.local/bin`):
```sh
curl -fsSL https://raw.githubusercontent.com/Agrim-Sigdel/quick-build/main/scripts/install.sh | bash
```
</details>

### Use it
```sh
quick-build create                                                    # interactive picker
quick-build create my-app --dir ~/apps/my-app --server --mobile --with auth,docker   # scriptable
quick-build create my-app --server --web --js-pm npm --py-pm pip       # use npm + pip instead of pnpm + uv
cd ~/apps/my-app && quick-build add storage                           # add a component later
```

> **No pnpm or uv?** The generator defaults to whichever managers are installed and falls back to
> `npm` + `pip` (both bundled with Node / Python). Pick them with `--js-pm pnpm|npm` and
> `--py-pm uv|pip`, or in the interactive prompt.

## What you can generate

**Apps** (pick any subset):

| App | Stack |
| --- | --- |
| `server` | Django 5 + DRF, managed by `uv` or `pip` (Python 3.12), SQLite by default |
| `web` | Next.js 14 (App Router) + TypeScript + Tailwind |
| `mobile` | Expo (React Native) + Expo Router + TypeScript |

Selecting a client app also brings `packages/shared` (TS interfaces) and, when a server is
present, `packages/api-client` (a typed client generated from the server's OpenAPI schema).

**Components** (`modules/`):

| id | What it adds |
| --- | --- |
| `db-postgres` | Switch the server from SQLite to PostgreSQL |
| `auth` | JWT auth — register/login/refresh/me, with a swappable `TokenStore` on the clients |
| `example` | A demo profile screen proving the client↔server wiring |
| `docker` | Postgres `docker-compose.yml` + a production `Dockerfile` |
| `ci` | Per-app GitHub Actions with path filters (independent builds) |
| `storage` | Reference *swappable provider*: `StorageProvider` ABC + Local/S3 backends |

Dependencies resolve automatically (e.g. `example → auth → db-postgres`), and incompatible
picks (a component that needs an app you didn't select) are rejected up front.

## How it works

Two pieces:

- **`modules/`** — the catalog. `_core/` holds the bare, feature-less scaffolds (with wiring
  anchors); every other folder is a component described by a `module.json` manifest.
- **`packages/cli/`** — the composer. It resolves your selection, copies only the needed files,
  and injects wiring at deterministic `# <quick-build:...>` anchors (idempotent, so `add` works too).

The output is a self-contained monorepo where each app can be developed and deployed on its own.

## Documentation

| Doc | Read it for |
| --- | --- |
| [creating-projects.md](docs/creating-projects.md) | **What you can create** — every app, component, flag, and common project shapes |
| [independent-workflows.md](docs/independent-workflows.md) | **Developing & deploying each part separately** — run/build/ship server, web, mobile on their own; split a part into its own repo |
| [feature-catalog.md](docs/feature-catalog.md) | **The menu of reusable features** — what's available now + a roadmap so you never rewrite the same boilerplate |
| [authoring-a-module.md](docs/authoring-a-module.md) | **How to add a feature** — recipes for server, client, ops, and swappable-provider components |
| [module-contract.md](docs/module-contract.md) | The `module.json` manifest spec (anchors, targets, wiring) |

## Extending the catalog

Adding a new component is **just a new folder under `modules/`** with a `module.json` — no
changes to the engine. Build the boilerplate once here and it appears in the picker for every
future project. See [feature-catalog.md](docs/feature-catalog.md) for a prioritized list of
components worth adding, and [authoring-a-module.md](docs/authoring-a-module.md) to build one.

## Development

```sh
pnpm --filter @agrimsigdel/quick-build build      # build the CLI
pnpm --filter @agrimsigdel/quick-build typecheck  # typecheck the engine
```

The generator locates the catalog by walking up from the CLI to find `modules/`.
Override with `QUICK_BUILD_MODULES_DIR=/path/to/modules`.

## Releasing

The CLI is published to npm as [`@agrimsigdel/quick-build`](https://www.npmjs.com/package/@agrimsigdel/quick-build).
Publishing is automated by [`.github/workflows/publish.yml`](.github/workflows/publish.yml):
push a version tag and CI builds, bundles `modules/`, and publishes.

```sh
npm version patch --workspace @agrimsigdel/quick-build   # bump version + create a matching git tag (v0.1.1)
git push --follow-tags                       # push the tag → CI publishes to npm
```

> One-time setup: add an `NPM_TOKEN` (an npm "Automation" access token) to the repo's
> **Settings → Secrets and variables → Actions**. The `prepack` script copies `modules/` +
> README + LICENSE into the package, so `npm publish` ships a self-contained CLI.
