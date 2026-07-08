# Authoring a module

A component is a folder under `modules/` with a `module.json`. No engine changes needed.
This walkthrough adds a hypothetical `notifications` component to the server.

## 1. Create the folder and manifest

```
modules/notifications/
├── module.json
└── server/
    └── notifications/
        ├── __init__.py
        ├── base.py         # NotificationProvider ABC
        ├── console.py      # dev impl
        └── factory.py      # get_notifier()
```

```jsonc
// modules/notifications/module.json
{
  "id": "notifications",
  "title": "Notifications (swappable)",
  "description": "Send notifications via a swappable provider.",
  "targets": ["server"],
  "requiresApps": ["server"],
  "provides": "notifications",
  "env": { "NOTIFY_BACKEND": "console" },
  "wiring": {
    "server": {
      "settings": ["NOTIFY_BACKEND = env(\"NOTIFY_BACKEND\", default=\"console\")"]
    }
  },
  "notes": ["Notifications: call get_notifier() from notifications.factory."]
}
```

## 2. Follow the swappable-provider pattern

Mirror `modules/storage/`: an abstract base class in `base.py`, one or more concrete
implementations, and a `factory.py` that reads a settings key and returns the configured
instance via `django.utils.module_loading.import_string`. Consumers depend on the ABC, never a
concrete class — so a new backend is just a new file + a settings value.

## 3. Wire in at anchors

Add lines to existing `<base:...>` anchors via `wiring`. If you need a brand-new anchor, add
the comment to the relevant `_core` scaffold (e.g. `# <base:my-anchor>` in `settings.py`) and
reference it from `wiring.<target>.anchors`. The generator errors loudly if a module references
an anchor that doesn't exist — that's your signal to add it to `_core`.

## 4. Declare relationships

- `requires`: components auto-pulled in (e.g. `["db-postgres"]`).
- `requiresApps`: apps that must be selected, or the pick is rejected.
- `provides` / `conflicts`: prevent two mutually-exclusive components being chosen together.

## 5. Test it

```sh
pnpm --filter @base/cli build
node packages/cli/dist/index.js create t --dir /tmp/t --server --with notifications --force
cd /tmp/t/apps/server && uv sync && uv run pytest -q
```

Ship a test under `modules/notifications/server/tests/` — it's copied alongside the app and
runs with the rest of the suite. Also confirm `base-cli add notifications` works on an existing
project (the same composer powers both, so idempotent anchor injection is all you need).

## Recipes by feature type

The `notifications` walkthrough above is a **server capability**. Other shapes:

### Client feature (web + mobile)
Ship shared types, per-platform impls, a provider, and screens. Example: a `query` (TanStack)
component.
```
modules/query/
├── module.json                  # targets: ["web","mobile"], provides: "data-layer"
├── shared/src/query-keys.ts     # (optional) shared types
├── web/src/query/provider.tsx   # QueryProvider component
└── mobile/src/query/provider.tsx
```
```jsonc
"wiring": {
  "web":    { "providers": ["QueryProvider,"], "deps": ["@tanstack/react-query@^5"],
              "anchors": { "providers-import": ["import { QueryProvider } from \"@/query/provider\";"] } },
  "mobile": { "providers": ["QueryProvider,"], "deps": ["@tanstack/react-query@^5"],
              "anchors": { "providers-import": ["import { QueryProvider } from \"@/query/provider\";"] } }
}
```
Add a page/screen by dropping a file into `web/app/…` or `mobile/app/…` and registering a nav
link via the `routes` field. Both clients wrap the app in `Providers`, so anything you register
is available app-wide.

### Pure-wiring component (no files)
Some components are just configuration — see `db-postgres` (a dep + an env var + a note, no
files at all). Give it `targets`, `env`, and `wiring.<target>.deps`/`settings`; ship no folder
of files.

### Ops / root component
Files destined for the repo root use the `root` target (dest = project root). See `docker`
(`root/infra/docker-compose.yml` + `server/Dockerfile`). For output that depends on *which apps*
are present (like per-app CI), generate it in the CLI's `rootgen.ts` and gate it on the
component id in `compose.ts` — that's how `ci` emits a workflow per selected app.

### Swappable provider (server capability)
The gold-standard pattern (see `storage`): an ABC in `base.py`, concrete impls, a `factory.py`
that resolves `settings.<X>_BACKEND` via `import_string`. Adding a backend later = one new file
+ one settings value, no caller changes. Use this for anything with interchangeable
implementations: email, sms, payments, search, cache.

## Checklist

- [ ] `id` matches the folder name and is kebab-case
- [ ] `targets` cover every folder you ship files in
- [ ] every `wiring` anchor exists in `_core` (or you added it)
- [ ] `env` documents each new variable
- [ ] `requires` / `requiresApps` / `provides` declared where relevant
- [ ] a test proves the happy path
- [ ] generated **and** `add`-ed projects both build
