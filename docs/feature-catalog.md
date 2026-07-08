# Feature catalog — build once, include everywhere

The point of `partweave` is that the boilerplate you'd otherwise rewrite in every project lives here
**once**, as a selectable component. You add it with a checkbox (or `--with`), you own the code,
and it's built on swappable interfaces so you can change the implementation without a rewrite.

This page is the menu: what's **available now**, and a concrete **roadmap** of components worth
adding — each written as a mini-spec (what it provides, which apps it touches, what it depends
on) so it can be built by dropping a folder into `modules/`. See
[authoring-a-module.md](authoring-a-module.md) to build one.

Legend: ✅ available · 🧩 planned (spec below, not built yet)

---

## Available now

| id | What you stop rewriting | Targets | Provides / requires |
| --- | --- | --- | --- |
| ✅ `db-postgres` | Postgres wiring + driver | server | provides `database` |
| ✅ `auth` | Register/login/refresh/JWT, custom user, `TokenStore` on clients | server, web, mobile, shared | provides `auth`; requires `db-postgres` |
| ✅ `example` | A working screen proving the client↔server round-trip | web, mobile | requires `auth` |
| ✅ `docker` | Local Postgres compose + prod server image | server, root | — |
| ✅ `ci` | Per-app GitHub Actions (path-filtered) | root | — |
| ✅ `storage` | `StorageProvider` ABC + Local/S3 (the swappable-provider reference) | server | provides `storage` |

---

## Roadmap

### Auth & identity
| id | What it gives you | Targets | Notes |
| --- | --- | --- | --- |
| 🧩 `auth-oauth` | Social login (Google/Apple/GitHub) | server, web, mobile | provides `auth`; alt/adds to `auth` |
| 🧩 `auth-session` | Cookie/session auth instead of JWT | server, web | provides `auth` (conflicts with `auth`) |
| 🧩 `auth-email-verify` | Email verification + password reset flows | server, web, mobile | requires `auth`, `email` |
| 🧩 `auth-2fa` | TOTP two-factor | server, web | requires `auth` |
| 🧩 `rbac` | Roles & permissions (decorators + client guards) | server, web, mobile, shared | requires `auth` |
| 🧩 `multi-tenancy` | Organizations/teams + per-tenant scoping | server, shared | requires `auth` |
| 🧩 `api-keys` | Machine-to-machine API keys | server | requires `auth` |

### Data & storage
| id | What it gives you | Targets | Notes |
| --- | --- | --- | --- |
| 🧩 `cache-redis` | Redis cache backend + compose service | server, root | provides `cache` |
| 🧩 `search` | Full-text search (Postgres FTS or Meilisearch) | server | provides `search` |
| 🧩 `file-uploads` | Upload endpoint + presigned URLs | server, web, mobile | requires `storage` |
| 🧩 `audit-log` | Soft-delete + change history mixin | server | — |
| 🧩 `pagination` | Standardized cursor pagination + client helpers | server, shared | — |

### Comms & notifications
| id | What it gives you | Targets | Notes |
| --- | --- | --- | --- |
| 🧩 `email` | `EmailProvider` ABC (SMTP/SendGrid/SES) + templates | server | provides `email` |
| 🧩 `push` | Expo push notifications end-to-end | server, mobile | provides `push` |
| 🧩 `sms` | `SmsProvider` (Twilio/…) | server | provides `sms` |
| 🧩 `notifications` | In-app notification model + feed + client hook | server, web, mobile, shared | requires `auth` |
| 🧩 `webhooks` | Outgoing webhook delivery with retries | server | requires `jobs` |

### Payments & billing
| id | What it gives you | Targets | Notes |
| --- | --- | --- | --- |
| 🧩 `payments-stripe` | `PaymentProvider` (Stripe) — checkout, webhooks | server, web | provides `payments` |
| 🧩 `subscriptions` | Plans, subscription state, billing portal | server, web | requires `payments-stripe`, `auth` |
| 🧩 `metering` | Usage-based billing counters | server | requires `payments-stripe` |

### Background & realtime
| id | What it gives you | Targets | Notes |
| --- | --- | --- | --- |
| 🧩 `jobs` | Background workers (Celery/RQ/Django-Q) + compose worker | server, root | provides `jobs`; requires `cache-redis` |
| 🧩 `scheduler` | Cron/periodic tasks | server | requires `jobs` |
| 🧩 `realtime` | WebSockets/SSE (Django Channels) + client hook | server, web, mobile, shared | provides `realtime` |

### Frontend / client experience
| id | What it gives you | Targets | Notes |
| --- | --- | --- | --- |
| 🧩 `query` | TanStack Query provider + typed hooks over `api-client` | web, mobile | provides `data-layer` |
| 🧩 `nativewind` | Tailwind classes on mobile | mobile | — |
| 🧩 `ui-kit` | Shared component library (buttons/inputs/cards), theming + dark mode | web, mobile, shared | — |
| 🧩 `forms` | react-hook-form + zod validation, shared schemas | web, mobile, shared | — |
| 🧩 `i18n` | Localization scaffolding + shared message catalog | web, mobile, shared | — |
| 🧩 `state` | App state store (Zustand) preset | web, mobile | — |

### Ops & observability
| id | What it gives you | Targets | Notes |
| --- | --- | --- | --- |
| 🧩 `sentry` | Error tracking wired into server + web + mobile | server, web, mobile | provides `error-tracking` |
| 🧩 `logging` | Structured JSON logging + request ids | server | — |
| 🧩 `rate-limit` | DRF throttling presets | server | — |
| 🧩 `healthz` | Readiness/liveness probes (DB, cache) | server | — |
| 🧩 `metrics` | Prometheus metrics endpoint | server | — |
| 🧩 `feature-flags` | Flag service + client hook | server, web, mobile, shared | — |
| 🧩 `analytics` | `AnalyticsProvider` (PostHog/GA) on clients | web, mobile, shared | provides `analytics` |
| 🧩 `api-versioning` | URL/header API versioning scaffold | server | — |

### Deployment presets
| id | What it gives you | Targets | Notes |
| --- | --- | --- | --- |
| 🧩 `deploy-railway` / `deploy-render` / `deploy-fly` | Server deploy config | server, root | pick one |
| 🧩 `deploy-vercel` | Web deploy config | web, root | — |
| 🧩 `eas` | Mobile build/submit profiles (`eas.json`) | mobile | — |

---

## Recommended build order

Highest leverage first — the things nearly every product needs:

1. **`email`** — unblocks verification, password reset, receipts (many features depend on it).
2. **`query`** — the data-fetching layer both clients want; makes `api-client` ergonomic.
3. **`jobs`** + **`cache-redis`** — async work + caching; unblocks webhooks, scheduler, metering.
4. **`payments-stripe`** + **`subscriptions`** — if you're building SaaS.
5. **`push`** / **`notifications`** — engagement for mobile-first products.
6. **`sentry`** + **`logging`** + **`rate-limit`** — production hardening.
7. **`ui-kit`** + **`forms`** — stop rebuilding buttons and validation every project.

Everything above is additive: build the ones you need, in any order, and they show up in the
picker for every future project.

## How to get one built

- **Build it yourself** — follow [authoring-a-module.md](authoring-a-module.md); most are a
  `module.json` + a few files, using the `storage` component as the abstract-provider template.
- **Ask** — describe the feature and its target apps, and it can be scaffolded into `modules/`
  following the same contract.
