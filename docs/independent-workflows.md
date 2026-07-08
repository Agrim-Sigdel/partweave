# Developing & deploying each part separately

A generated project is a monorepo, but every part is **self-contained** — its own deps, env,
build, and (where relevant) Dockerfile. You can develop, test, and deploy any app on its own,
or all together. The only optional coupling is the OpenAPI-generated API client.

> The commands below assume the default managers (**pnpm** + **uv**). If you generated with
> `--js-pm npm`, use `npm run <script> -w <app>` instead of `pnpm --filter <app> <script>`. If you
> generated with `--py-pm pip`, the server uses a `.venv` — run `python -m venv .venv &&
> .venv/bin/python scripts/sync_deps.py` to install, then `.venv/bin/python …` in place of
> `uv run …`. In all cases the generated `Makefile` targets (`make server`, `make web`, …) already
> use the right commands, so `make` is the manager-agnostic path.

## The one coupling: the API contract

The server owns the contract. It publishes an OpenAPI schema at `/api/schema/`; the clients
consume a **typed client generated from it** (`packages/api-client`). That's the entire
server↔client link — there's no shared runtime code across the Python/TypeScript boundary.

```
apps/server ──(OpenAPI schema)──▶ packages/api-client ──▶ apps/web
                                                       └──▶ apps/mobile
```

Regenerate after changing the API: `make gen-api` (server must be running). Clients that don't
need the server (e.g. a static marketing site) simply don't import it.

## Server — `apps/server`

**Develop**
```sh
cd apps/server
uv sync                                   # installs into an isolated .venv (Python 3.12)
uv run python manage.py migrate
uv run python manage.py runserver         # http://localhost:8000
uv run pytest                             # tests
uv run ruff check .                       # lint
```

**Deploy** — it's a plain Django app with a `Dockerfile` (from the `docker` component):
```sh
docker build -t my-api apps/server
```
Ships to any container host — Railway, Render, Fly.io, ECS, Cloud Run. In production set
`DATABASE_URL` to a managed Postgres, a strong `DJANGO_SECRET_KEY`, and `DJANGO_DEBUG=false`.
Nothing about the server depends on the web or mobile apps.

## Web — `apps/web`

**Develop**
```sh
pnpm --filter web dev                     # http://localhost:3000
pnpm --filter web typecheck
pnpm --filter web build                   # production build
```

**Deploy** — a standard Next.js app: push to **Vercel** (zero config) or build a container.
Set `NEXT_PUBLIC_API_URL` to your deployed server. It builds and deploys with no knowledge of
the mobile app or (beyond the generated client) the server.

## Mobile — `apps/mobile`

**Develop**
```sh
pnpm --filter mobile start                # Expo dev server → Expo Go / simulator
pnpm --filter mobile typecheck
```

**Deploy** — via **EAS Build**:
```sh
cd apps/mobile
eas build --profile production --platform ios     # or android
eas submit
```
Set `EXPO_PUBLIC_API_URL`. Mobile ships to the app stores entirely independently.

## Independent CI

The `ci` component writes **per-app workflows with path filters**, so a change under
`apps/web/**` runs only the web pipeline, `apps/server/**` only the server pipeline, etc. No
app rebuilds because another changed. See `.github/workflows/*.yml`.

## Working on one app without the others

Because each app is isolated you can, for example, run only the server and its tests without
ever installing the JS toolchain, or iterate on the web app against a deployed API without
running Django locally. `pnpm --filter <app>` and the per-app `make` targets scope work to a
single part.

## Splitting a part into its own repo

Any folder is self-contained enough to "graduate" into a standalone repo:

```sh
# option A: history-preserving
git subtree split --prefix=apps/server -b server-only
# push that branch to a new repo

# option B: just copy it
cp -r apps/server ~/new-repo && cd ~/new-repo && git init
```

The server needs no monorepo files to run (`uv` reads its own `pyproject.toml`). A client that
used `packages/api-client` should either vendor the generated `schema.d.ts` or keep pointing
`gen-api` at the server's schema URL.
```
