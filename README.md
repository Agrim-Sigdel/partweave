# base — a modular full-stack scaffolder

Clone this repo once, then generate new projects that contain **only the parts you pick** —
a Django server, a Next.js web app, an Expo mobile app, and cross-cutting components
(auth, storage, docker, CI) — all wired together.

It's `create-t3-app` (choose your stack) meets `shadcn/ui` (you own the code that's added,
built on clean, swappable interfaces).

```sh
# one-time setup of the generator
pnpm install
pnpm --filter @base/cli build

# scaffold a new project (interactive)
node packages/cli/dist/index.js create

# ...or non-interactively
node packages/cli/dist/index.js create my-app --dir ~/apps/my-app --server --mobile --with auth,docker

# add a component to an existing generated project later
cd ~/apps/my-app && node /path/to/base/packages/cli/dist/index.js add storage
```

> Tip: `pnpm --filter @base/cli link --global` exposes `create-base-app` and `base-cli` on your PATH.

## What you can generate

**Apps** (pick any subset):

| App | Stack |
| --- | --- |
| `server` | Django 5 + DRF, managed by `uv` (Python 3.12), SQLite by default |
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
  and injects wiring at deterministic `# <base:...>` anchors (idempotent, so `add` works too).

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
pnpm --filter @base/cli build      # build the CLI
pnpm --filter @base/cli typecheck  # typecheck the engine
```

The generator locates the catalog by walking up from the CLI to find `modules/`.
Override with `BASE_MODULES_DIR=/path/to/modules`.
