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

Add lines to existing `<partweave:...>` anchors via `wiring`. If you need a brand-new anchor, add
the comment to the relevant `_core` scaffold (e.g. `# <partweave:my-anchor>` in `settings.py`) and
reference it from `wiring.<target>.anchors`. The generator errors loudly if a module references
an anchor that doesn't exist — that's your signal to add it to `_core`.

## 4. Declare relationships

- `requires`: components auto-pulled in (e.g. `["db-postgres"]`).
- `requiresApps`: apps that must be selected, or the pick is rejected.
- `provides` / `conflicts`: prevent two mutually-exclusive components being chosen together.

## 5. Test it

**Every module must ship tests** — they're copied into generated projects and run by CI
(`.github/workflows/ci.yml`), which is what stops a broken module from ever being published.
Put tests next to the code, per target:

| Target | Runner | Where the test file goes |
| --- | --- | --- |
| server | pytest (`pytest-django`) | `modules/<id>/server/**/tests/test_*.py` |
| web | Vitest | `modules/<id>/web/**/*.test.ts(x)` |
| mobile | jest-expo | `modules/<id>/mobile/**/*.test.ts(x)` |

The runners themselves live in the `_core` scaffolds (`_core/web/vitest.config.mts`,
`_core/mobile/jest.config.js`), so any app you generate can already run `pnpm test`. Web/mobile
tests default to a fast `node` environment; component tests opt into a DOM with a
`// @vitest-environment jsdom` (web) or `/** @jest-environment node|jsdom */` (mobile) docblock.
See `modules/auth/web/src/auth/auth-client.test.ts` for the pattern (inject deps, stub `fetch`).

Run the exact checks CI runs against a generated project:

```sh
pnpm --filter partweave build
pnpm --filter partweave test
pnpm --filter partweave test:catalog --case module-feedback
# Omit --case to check every selectable module, bare apps, and combined features.
```

Replace `module-feedback` with `module-<your-id>`. CI discovers these cases from
the CLI catalog automatically. Postgres modules need a disposable database with
database-creation privileges (`PARTWEAVE_TEST_DATABASE_URL`); each case creates and
removes its own database. Checks include ordinary migrations before pytest so a
missing migration cannot be hidden by Django's test database setup.

Keep unfinished designs under `docs/planned-modules/`. A manifest under `modules/`
immediately makes the feature selectable, so add it only with working templates,
resolvable dependencies, and passing generated-project checks.

Prefer a **regression test that fails without your fix**: assert the wrong behavior is gone, not
just that the happy path works. Also confirm `partweave add notifications` works on an existing
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
