# The module contract (`module.json`)

Every component under `modules/<id>/` is described by a `module.json`. The generator reads
these manifests, resolves dependencies, copies the component's files, and injects wiring.

## Fields

| field | type | default | meaning |
| --- | --- | --- | --- |
| `id` | string (kebab-case) | — | unique id; must equal the folder name |
| `title` | string | — | shown in the picker and README |
| `description` | string | `""` | one-line hint |
| `kind` | `"feature"` \| `"app"` | `"feature"` | `app` is a built-in toggle; components are `feature` |
| `targets` | `TargetName[]` | — | which sub-projects it contributes to (below) |
| `requiresApps` | `AppName[]` | `[]` | apps that MUST **all** be selected (else the pick is rejected) |
| `requiresOneOf` | `AppName[][]` | `[]` | disjunctive requirements: each inner array is an OR-group, all groups must hold — e.g. `[["web","mobile"]]` = "needs a web **or** mobile client" |
| `requires` | `string[]` | `[]` | other components auto-selected with this one |
| `conflicts` | `string[]` | `[]` | components that cannot coexist with this one |
| `provides` | string | — | capability tag; two modules providing the same one conflict |
| `default` | boolean | `false` | pre-checked in the interactive picker |
| `env` | `Record<string,string>` | `{}` | env keys → default value; routed to the consuming app's `.env`/`.env.example` by prefix (`POSTGRES_`→root, `NEXT_PUBLIC_`→web, `EXPO_PUBLIC_`→mobile, else server) |
| `wiring` | `Record<TargetName, Wiring>` | `{}` | per-target injection (below) |
| `enhances` | `Record<capability, Record<TargetName, Wiring>>` | `{}` | soft-join wiring applied only when another present module `provides` that capability (below) |
| `notes` | `string[]` | `[]` | printed after generation |

A module that contributes to **none** of the selected targets is rejected (it would install as a
silent no-op) — so `targets` must intersect the chosen apps, on top of satisfying `requiresApps`
and `requiresOneOf`.

### Targets and where their files land

```
root        → <project>/            server → <project>/apps/server/
web         → <project>/apps/web/   mobile → <project>/apps/mobile/
shared      → <project>/packages/shared/
api-client  → <project>/packages/api-client/
```

Files for a target live at `modules/<id>/<target>/…` and are copied verbatim (with `{{token}}`
rendering). A target the user didn't select is skipped, so a module can safely target several
apps at once.

## Wiring (per target)

Wiring injects lines at **anchors** — comments of the form `<partweave:ANCHOR_ID>` in the `_core`
scaffolds. Injection is idempotent (a line already present is skipped) and preserves the
anchor's indentation.

Convenience fields map to well-known anchors:

| field | anchor | typical target |
| --- | --- | --- |
| `installedApps` | `<partweave:installed-apps>` | server `settings.py` |
| `urls` | `<partweave:urls>` | server `urls.py` |
| `settings` | `<partweave:settings>` | server `settings.py` |
| `providers` | `<partweave:providers>` | web/mobile `providers.tsx` |
| `routes` | `<partweave:routes>` | web/mobile `nav.ts` |

Plus two special keys:

- `deps` — dependency specifiers. For `server` they're injected into the pyproject
  `<partweave:deps>` anchor (`"pkg>=x"`); for JS targets they're merged into `package.json`
  (`"name@version"`; use `@app/shared@workspace:*` for workspace packages).
- `anchors` — an escape hatch: `{ "any-anchor-id": ["line", ...] }` for anchors without a
  convenience field (e.g. server `<partweave:drf-auth>`, shared `<partweave:exports>`, web
  `<partweave:providers-import>`).

### Example

```jsonc
{
  "id": "auth",
  "title": "Authentication (JWT)",
  "targets": ["server", "web", "mobile", "shared"],
  "requiresApps": ["server"],
  "requires": ["db-postgres"],
  "provides": "auth",
  "wiring": {
    "server": {
      "installedApps": ["\"accounts\","],
      "urls": ["path(\"api/auth/\", include(\"accounts.urls\")),"],
      "settings": ["AUTH_USER_MODEL = \"accounts.User\""],
      "deps": ["djangorestframework-simplejwt>=5.3"],
      "anchors": { "drf-auth": ["\"...JWTAuthentication\","] }
    },
    "web": {
      "providers": ["AuthProvider,"],
      "routes": ["{ href: \"/login\", label: \"Log in\" },"],
      "deps": ["@app/shared@workspace:*"],
      "anchors": { "providers-import": ["import { AuthProvider } from \"@/auth/auth-context\";"] }
    }
  }
}
```

## Soft-joins (`enhances`)

`requires` is a **hard** join (the dependency is auto-selected). `enhances` is a **soft** join:
extra wiring that applies *only* when another module offering a capability is already present, and
does nothing otherwise. Use it when a module works alone but should light up an integration when a
counterpart is installed — e.g. `feedback` attributing submissions to a user *if* an auth provider
is present, without hard-requiring auth.

```json
"enhances": {
  "auth": {                                  // capability (a `provides` value), not a module id
    "server": { "settings": ["FEEDBACK_ATTRIBUTE_USER = True"] }
  }
}
```

Rules:

- **Keyed on capability, not module id** — so the join fires for *any* provider of `auth`
  (`auth`, a future `auth-session`, …), not one specific module.
- **Symmetric and order-independent.** The active enhancement set is a pure function of which
  modules end up installed, so `create --with feedback,auth`, `create --with feedback` + `add auth`,
  and `create --with auth` + `add feedback` all converge to the same wiring. Adding the provider
  later re-applies the enhancement automatically.
- **Same injection as `wiring`** — idempotent, at anchors. A soft-join that targets an anchor the
  project has lost fails the same missing-anchor preflight and is reported by `partweave doctor`.
- Not a dependency: `enhances` never auto-selects the other module. If neither is present, nothing
  happens.

When a join needs more than a few injected lines (its own models, screens, endpoints), prefer a
dedicated **bridge module** with `requires: ["feedback", "auth"]` instead — no engine support
needed, the resolver already handles it.

## Render tokens

Text files are rendered through `{{token}}`. Available: `projectName`, `projectSlug`,
`description`, `packageId` (Android-safe), `apps.list`. Unknown tokens are left untouched, and
`style={{ ... }}` / `${...}` never match.
