# What you can create

`partweave` generates a monorepo containing **only the parts you select**. This page covers every
app and component available today, the CLI, and common project shapes.

## The command

```sh
# interactive — asks which apps + components you want
node packages/cli/dist/index.js create

# non-interactive — driven entirely by flags
node packages/cli/dist/index.js create <name> --dir <path> [app flags] [--with <ids>]
```

| flag | meaning |
| --- | --- |
| `<name>` | project name (used for slugs, titles, package id) |
| `--dir <path>` | where to write the project (a **new** folder) |
| `--server` / `--no-server` | include/exclude the Django API |
| `--web` / `--no-web` | include/exclude the Next.js web app |
| `--mobile` / `--no-mobile` | include/exclude the Expo mobile app |
| `--with <ids>` | comma-separated component ids (`auth,docker,ci,storage,…`) |
| `--js-pm <pm>` | JS/TS package manager: `pnpm` or `npm` (default: auto-detect) |
| `--py-pm <pm>` | Python package manager (server): `uv` or `pip` (default: auto-detect) |
| `-y, --yes` | skip prompts; use flags + defaults |
| `-f, --force` | write into a non-empty directory |

If you pass any app flag (or `--yes`), it runs non-interactively. Omitting `--with` in that mode
selects the **default** components that apply to your chosen apps.

### Package managers

You don't need `pnpm` or `uv` — the generator adapts to what you pick (or what's installed). It
defaults to **pnpm** and **uv** when they're on your `PATH`, otherwise falls back to **npm** and
**pip** (both ship with Node / Python). Override either explicitly with `--js-pm` / `--py-pm`, or
choose them in the interactive prompt. The choice is recorded in `.partweave/manifest.json`, so
later `add`s stay consistent. Everything the generator emits — the runner, `Makefile`, workspace
layout, CI, and the server `Dockerfile` — speaks the manager you chose. (The `pip` path uses a
`.venv` and a small `apps/server/scripts/sync_deps.py` helper as the counterpart to `uv sync`.)

If you pick a manager that isn't installed, partweave offers to install it (pnpm via `corepack`,
uv via its official installer) and otherwise falls back to npm/pip — so you never get a broken
project. Run **`partweave doctor`** any time to check your environment and install a missing
manager. Pass `--install` to `create` to run the install step automatically after scaffolding.

## Apps

| App | Folder | Stack | Runs with |
| --- | --- | --- | --- |
| Server | `apps/server` | Django 5 + DRF, `uv` or `pip` (Python 3.12), SQLite by default | `npm run server` |
| Web | `apps/web` | Next.js 14 (App Router) + TypeScript + Tailwind | `npm run web` |
| Mobile | `apps/mobile` | Expo (React Native) + Expo Router + TypeScript | `npm run mobile` |

Derived automatically:

- `packages/shared` — shared TS interfaces/types — added whenever **web or mobile** is present.
- `packages/api-client` — a **typed client generated from the server's OpenAPI schema** — added
  whenever a **server + a client** are both present. Regenerate with `npm run gen:api`.

## Components (available now)

| id | Adds | Targets | Auto-adds |
| --- | --- | --- | --- |
| `db-postgres` | PostgreSQL instead of SQLite | server | — |
| `auth` | JWT auth (register/login/refresh/me) + swappable `TokenStore` on clients | server, web, mobile, shared | `db-postgres` |
| `example` | Demo profile screen proving client↔server wiring | web, mobile | `auth` |
| `docker` | Postgres `docker-compose.yml` + production `Dockerfile` | server, root | — |
| `ci` | Per-app GitHub Actions with path filters | root | — |
| `storage` | `StorageProvider` ABC + Local/S3 backends (the swappable-provider reference) | server | — |

> More components (payments, notifications, email, realtime, …) are on the roadmap — see
> [feature-catalog.md](feature-catalog.md). Each is added by dropping a new folder into `modules/`.

## Common project shapes

```sh
# 1. Backend-only API (microservice / headless)
create api --dir ~/apps/api --server --no-web --no-mobile --with docker,ci

# 2. Web SaaS (web + API + auth + Postgres + Docker + CI)
create saas --dir ~/apps/saas --server --web --no-mobile --with auth,example,docker,ci

# 3. Mobile app + backend
create app --dir ~/apps/app --server --no-web --mobile --with auth,example,docker

# 4. Everything
create platform --dir ~/apps/platform --server --web --mobile --with auth,example,storage,docker,ci

# 5. Just a web frontend (no backend) — talks to some other API
create site --dir ~/apps/site --no-server --web --no-mobile
```

## After generating

Every project ships a cross-platform task runner (`scripts/run.mjs`) with matching `npm run`
scripts, so the same commands work on **macOS, Linux, and Windows**:

```sh
npm run bootstrap              # install deps (your chosen JS + Python managers)
npm run db:up && npm run migrate   # Postgres (if docker) + migrations (if server)
npm run server / npm run web / npm run mobile
npm run dev                    # run all dev servers at once
npm run gen:api                # regenerate the typed client (if api-client present)
```

On macOS/Linux a `Makefile` is generated too, as a thin convenience wrapper — `make bootstrap`,
`make web`, etc. all just call the runner. Windows users use `npm run <task>` (or
`node scripts/run.mjs <task>` directly). `bootstrap` is self-healing: if the project's package
manager is missing it enables pnpm via `corepack`, or points you at the uv installer.

Copy `.env.example` → `.env` and fill in values first. Each project also records what it
contains in `.partweave/manifest.json`, which powers `add` (below).

## Growing a project later

Run `add` from inside a generated project (or pass `--dir`) to add **either an app or a
component** — the manifest tracks what's installed, so this is safe and idempotent.

```sh
# add a component (feature) — wires it into your current apps
partweave add storage
partweave add auth              # pulls in db-postgres automatically

# add a whole app later — e.g. you started backend-only and now want a web frontend
partweave add web
partweave add mobile
partweave add server            # add a backend to a web/mobile-only project
```

Adding an app is smart: it scaffolds the new app (plus derived packages like `shared` /
`api-client`) **and brings in the app-side of every component you already have**. So
`add web` to a `server + auth` project also drops in the login page, auth context, and wires
the provider — no manual glue. It then updates the workspace (`pnpm-workspace.yaml` or
`package.json`), the runner/`Makefile`, and `.env.example` for the new app.

After an `add`, `partweave` reminds you to run `npm run bootstrap` (and `npm run migrate` when the
server changed) to sync the new dependencies.
