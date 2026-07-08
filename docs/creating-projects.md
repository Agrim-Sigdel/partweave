# What you can create

`quick-build` generates a monorepo containing **only the parts you select**. This page covers every
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
| `-y, --yes` | skip prompts; use flags + defaults |
| `-f, --force` | write into a non-empty directory |

If you pass any app flag (or `--yes`), it runs non-interactively. Omitting `--with` in that mode
selects the **default** components that apply to your chosen apps.

## Apps

| App | Folder | Stack | Runs with |
| --- | --- | --- | --- |
| Server | `apps/server` | Django 5 + DRF, `uv` (Python 3.12), SQLite by default | `make server` |
| Web | `apps/web` | Next.js 14 (App Router) + TypeScript + Tailwind | `make web` |
| Mobile | `apps/mobile` | Expo (React Native) + Expo Router + TypeScript | `make mobile` |

Derived automatically:

- `packages/shared` — shared TS interfaces/types — added whenever **web or mobile** is present.
- `packages/api-client` — a **typed client generated from the server's OpenAPI schema** — added
  whenever a **server + a client** are both present. Regenerate with `make gen-api`.

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

Every project has a `Makefile` tailored to what you selected:

```sh
make bootstrap                 # install deps (pnpm + uv, as applicable)
make db-up && make migrate     # Postgres (if docker) + migrations (if server)
make server / make web / make mobile
make gen-api                   # regenerate the typed client (if api-client present)
```

Copy `.env.example` → `.env` and fill in values first. Each project also records what it
contains in `.quick-build/manifest.json`, which powers `add` (below).

## Growing a project later

Run `add` from inside a generated project (or pass `--dir`) to add **either an app or a
component** — the manifest tracks what's installed, so this is safe and idempotent.

```sh
# add a component (feature) — wires it into your current apps
quick-build add storage
quick-build add auth              # pulls in db-postgres automatically

# add a whole app later — e.g. you started backend-only and now want a web frontend
quick-build add web
quick-build add mobile
quick-build add server            # add a backend to a web/mobile-only project
```

Adding an app is smart: it scaffolds the new app (plus derived packages like `shared` /
`api-client`) **and brings in the app-side of every component you already have**. So
`add web` to a `server + auth` project also drops in the login page, auth context, and wires
the provider — no manual glue. It then updates `pnpm-workspace.yaml`, the `Makefile`, and
`.env.example` for the new app.

After an `add`, sync deps: `pnpm install` (JS apps) and/or `cd apps/server && uv sync` (server).
