# Feature catalog: build once, include everywhere

The point of `partweave` is that the boilerplate you'd otherwise rewrite in every project lives here
**once**, as a selectable component. You add it with a checkbox (or `--with`), you own the code,
and it's built on swappable interfaces so you can change the implementation without a rewrite.

This page is the menu: what's **available now**, and a concrete **roadmap** of components worth
adding, each written as a mini-spec (what it provides, which apps it touches, what it depends
on), so it can be built by dropping a folder into `modules/`. See
[authoring-a-module.md](authoring-a-module.md) to build one, and
[verified-modules.md](verified-modules.md) for the Dafny-specified core + wrapper modules.

Legend: `[built]` available now · `[planned]` on the roadmap (spec below, not built yet)

---

## Available now

### Core stack & UI
| id | What you stop rewriting | Targets | Provides / requires |
| --- | --- | --- | --- |
| [built] `db-postgres` | Postgres wiring + driver | server | provides `database` |
| [built] `auth` | Register/login/refresh/JWT, custom user, `TokenStore` on clients | server, web, mobile, shared | provides `auth`; requires `db-postgres` |
| [built] `example` | A working screen proving the client↔server round-trip | web, mobile | requires `auth` |
| [built] `docker` | Local Postgres compose + prod server image | server, root | n/a |
| [built] `ci` | Per-app GitHub Actions (path-filtered) | root | n/a |
| [built] `storage` | `StorageProvider` ABC + Local/S3 (the swappable-provider reference) | server | provides `storage` |
| [built] `ui-kit` | Owned Button/Badge/Card/Container/Input primitives (cva + cn), stock Tailwind zinc/blue palette with dark: support | web | n/a |
| [built] `feedback` | Public feedback API, database migration, and linked web/mobile submission forms | server, web, mobile | requires server; works without auth |

### Verified-core logic & domain modules (`spec.dfy` + Python core/wrapper + TS `shared`)
| id | What you stop rewriting | Targets | Wrapper pattern |
| --- | --- | --- | --- |
| [built] `workflow-engine` | Finite-state-machine engine + atomic transition log | server, shared | State-Machine |
| [built] `rbac` | Role/permission/superuser evaluator + `401`/`403` guard | server, shared | Policy / Guard |
| [built] `multi-tenancy` | Tenant membership & cross-tenant isolation guard | server, shared | Policy / Guard |
| [built] `api-keys` | Key prefix, revocation, expiry & scope validator | server, shared | Policy / Guard |
| [built] `audit-log` | Recursive sensitive-field scrubber & change-diff recorder | server, shared | Pure Transform |
| [built] `pagination` | Bounded cursor encode/decode & page window slicer | server, shared | Pure Transform |
| [built] `subscriptions` | Plan lifecycle transitions + integer-cent proration | server, shared | State-Machine |
| [built] `metering` | Quota conservation & overage tracking | server, shared | Counter / Quota |
| [built] `rate-limit` | Token-bucket refill bounds & `Retry-After` enforcer | server, shared | Counter / Quota |
| [built] `auth-2fa` | RFC-6238 TOTP window check + single-use backup codes | server, shared | Pure Transform + State-Machine |
| [built] `ledger` | Double-entry zero-sum journal poster & balance guard | server, shared | Counter / Quota |
| [built] `pricing` | Bounded percentage/flat discounts, tax & total breakdown | server, shared | Counter / Quota |
| [built] `reservations` | Non-overlapping time slots & stock conservation | server, shared | Counter / Quota |
| [built] `quorum` | Distinct-voter `k-of-n` approval/rejection state machine | server, shared | State-Machine + Policy Guard |
| [built] `filter-eval` | Allowlisted, bounded-depth AST filter evaluator (no `eval()`) | server, shared | Pure Transform |
| [built] `resolve-dag` | Transitive dependency closure, conflict & cycle-free planner | server, shared | Pure Transform |

Every selectable module gets its own generated-project CI job, with only its
declared dependencies. Checks cover installation, typechecks, client tests and
builds, Django migrations and tests. Separate cases cover bare apps, the combined
catalog, and feedback using npm/pip. Run the same checks locally after building:

```sh
pnpm --filter partweave build
pnpm --filter partweave test:catalog
# Or one case; keep its generated project for inspection:
pnpm --filter partweave test:catalog --case module-feedback --keep
```

Postgres cases use the generated connection defaults unless
`PARTWEAVE_TEST_DATABASE_URL` points to a disposable test database. That database's
user needs permission to create databases; each case creates and removes its own
isolated database. SQLite cases run without Postgres. Failed projects are retained
for inspection; successful projects are removed unless `--keep` is passed.

---

## Roadmap

### Auth & identity
| id | What it gives you | Targets | Notes |
| --- | --- | --- | --- |
| [planned] `auth-oauth` | Social login (Google/Apple/GitHub) | server, web, mobile | provides `auth`; alt/adds to `auth` |
| [planned] `auth-session` | Cookie/session auth instead of JWT | server, web | provides `auth` (conflicts with `auth`) |
| [planned] `auth-email-verify` | Email verification + password reset flows | server, web, mobile | requires `auth`, `email` |

### Data & storage
| id | What it gives you | Targets | Notes |
| --- | --- | --- | --- |
| [planned] `cache-redis` | Redis cache backend + compose service | server, root | provides `cache` |
| [planned] `search` | Full-text search (Postgres FTS or Meilisearch) | server | provides `search` |
| [planned] `file-uploads` | Upload endpoint + presigned URLs | server, web, mobile | requires `storage` |

### Comms & notifications
| id | What it gives you | Targets | Notes |
| --- | --- | --- | --- |
| [planned] `email` | `EmailProvider` ABC (SMTP/SendGrid/SES) + templates | server | provides `email` |
| [planned] `push` | Expo push notifications end-to-end | server, mobile | provides `push` |
| [planned] `sms` | `SmsProvider` (Twilio/…) | server | provides `sms` |
| [planned] `notifications` | In-app notification model + feed + client hook | server, web, mobile, shared | requires `auth` |
| [planned] `webhooks` | Outgoing webhook delivery with retries | server | requires `jobs` |

### Payments & billing
| id | What it gives you | Targets | Notes |
| --- | --- | --- | --- |
| [planned] `payments-stripe` | `PaymentProvider` (Stripe): checkout, webhooks | server, web | provides `payments` |

### Background & realtime
| id | What it gives you | Targets | Notes |
| --- | --- | --- | --- |
| [planned] `jobs` | Background workers (Celery/RQ/Django-Q) + compose worker | server, root | provides `jobs`; requires `cache-redis` |
| [planned] `scheduler` | Cron/periodic tasks | server | requires `jobs` |
| [planned] `realtime` | WebSockets/SSE (Django Channels) + client hook | server, web, mobile, shared | provides `realtime` |

### Frontend / client experience
| id | What it gives you | Targets | Notes |
| --- | --- | --- | --- |
| [planned] `query` | TanStack Query provider + typed hooks over `api-client` | web, mobile | provides `data-layer` |
| [planned] `nativewind` | Tailwind classes on mobile | mobile | n/a |
| [planned] `ui-kit-mobile` | Mobile-side primitives to match the web `ui-kit`, plus shared design tokens | mobile, shared | n/a |
| [planned] `forms` | react-hook-form + zod validation, shared schemas | web, mobile, shared | n/a |
| [planned] `i18n` | Localization scaffolding + shared message catalog | web, mobile, shared | n/a |
| [planned] `state` | App state store (Zustand) preset | web, mobile | n/a |

### Ops & observability
| id | What it gives you | Targets | Notes |
| --- | --- | --- | --- |
| [planned] `sentry` | Error tracking wired into server + web + mobile | server, web, mobile | provides `error-tracking` |
| [planned] `logging` | Structured JSON logging + request ids | server | n/a |
| [planned] `healthz` | Readiness/liveness probes (DB, cache) | server | n/a |
| [planned] `metrics` | Prometheus metrics endpoint | server | n/a |
| [planned] `feature-flags` | Flag service + client hook | server, web, mobile, shared | n/a |
| [planned] `analytics` | `AnalyticsProvider` (PostHog/GA) on clients | web, mobile, shared | provides `analytics` |
| [planned] `api-versioning` | URL/header API versioning scaffold | server | n/a |

### Deployment presets
| id | What it gives you | Targets | Notes |
| --- | --- | --- | --- |
| [planned] `deploy-railway` / `deploy-render` / `deploy-fly` | Server deploy config | server, root | pick one |
| [planned] `deploy-vercel` | Web deploy config | web, root | n/a |
| [planned] `eas` | Mobile build/submit profiles (`eas.json`) | mobile | n/a |

---

## How to get one built

- **Build it yourself**: follow [authoring-a-module.md](authoring-a-module.md); most are a
  `module.json` + a few files, using `storage` (swappable provider) or `workflow-engine` / `rbac`
  (verified core + wrapper) as reference templates.
- **Ask**: describe the feature and its target apps, and it can be scaffolded into `modules/`
  following the same contract.
