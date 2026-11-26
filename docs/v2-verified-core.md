# Partweave v2 Vision: Verified Logic Cores + Common Template Shells

> **Status:** Architectural proposal for **partweave v2** (the published CLI in
> `packages/cli/package.json` remains at `0.6.0`).

## Motivation

Today, `partweave` scaffolds full-stack applications cleanly by composing template
modules (`modules/<id>/module.json`) into a Django + Next.js + Expo monorepo and
wiring them through `<partweave:*>` anchors.

However, not all code inside a module carries the same kind of complexity:

- **~70–80% of the code** is framework plumbing, UI components, configuration, and
  infrastructure (Django views/ORM/migrations, Tailwind UI primitives, Docker Compose,
  GitHub Actions, SDK initialization).
- **~20–30% of the code** is pure state, rule, or math logic (state machines,
  authorization policies, billing/quota arithmetic, rate-limiting math, dependency
  resolution)—and that smaller slice is where subtle security, consistency, and edge-case
  bugs live.

In **v2**, instead of authoring critical rule logic by hand in both Python and
TypeScript—or trying to force a mathematical language to generate Dockerfiles and React
components—`partweave` separates each logic-heavy component into:

1. **A mathematically verified core** emitted by a proof-oriented language.
2. **A common template/adapter function** that wraps that pure core with the abstract,
   I/O-bound, framework-specific shell.

---

## Core Architecture: Verified Core, Common Template Shell

```
┌──────────────────────────────────────────────────────────┐
│  1. Proof / Math Layer (Dafny, Lean 4, F*)               │
│     Pure functions + invariants + proofs (no DB/HTTP/UI) │
│     Proof-only terms (Prop / ghost) are erased at build  │
│     → emits runtime core: core.py / core.js / core.wasm  │
└───────────────────────────┬──────────────────────────────┘
                            │  uniform pure signature
                            ▼
┌──────────────────────────────────────────────────────────┐
│  2. Common Template / Wrapper Function                   │
│     Wraps any verified core with abstract framework I/O: │
│     DB load/save, HTTP request/response, auth context,   │
│     immutable logging, error mapping, client hooks       │
└───────────────────────────┬──────────────────────────────┘
                            │  produces
                            ▼
┌──────────────────────────────────────────────────────────┐
│  3. Standard Partweave Module (modules/<id>/)            │
│     Installed and wired via module.json + anchors        │
└──────────────────────────────────────────────────────────┘
```

### Proof Erasure (Why Verification Adds Zero Runtime Weight)

Theorem provers and verification languages separate **computational data** (`Type` /
runtime variables) from **mathematical proofs** (`Prop` in Lean 4 / Rocq, `ghost` and
`requires`/`ensures` in Dafny, `0`-multiplicity arguments in Idris 2).

Once the type-checker or SMT solver verifies the mathematical invariants at compile time,
all proof-only terms are **erased** before code generation. Only fast, ordinary runtime
functions remain in the emitted `.py`, `.js`, `.c`, or `.wasm` output.

---

## Choosing the Proof Writer for Partweave's Stack

Because `partweave` targets **Python** (`server`) and **TypeScript/JavaScript** (`web`,
`mobile`, `shared`), proof tools differ in how cleanly their output integrates:

| Tool | Emitted Runtime Output | Integration Fit for `server` (Python) & `web`/`mobile` (TS) | Best Role in v2 |
| --- | --- | --- | --- |
| **Dafny** | **Python, JS/TS**, C#, Go, Java | **Best direct source output.** Emits standalone `.py` and `.js` modules verified by Z3; uses a small runtime helper for arbitrary-precision ints and immutable collections. | Shared business rules, state machines, billing math, policy checks |
| **F\* (Low\* + KaRaMeL)** | **C** (compiles to **WASM** or Python `cffi`) | **Best zero-overhead systems output.** Emits readable, production-grade C with proofs erased; needs a thin WASM/FFI bridge. | Parsers, crypto, high-throughput rule kernels |
| **Lean 4** | **C / native binary** (or community WASM) | Strongest interactive theorem prover and native functional language, but does **not** emit idiomatic TS/Python directly; integrate via C FFI, WASM, or subprocess. | Self-contained solvers, offline verification of generator invariants (`resolve.ts`) |
| **Idris 2** | **JavaScript / Node**, C, Chez Scheme | Clean erasure via Quantitative Type Theory (`0`-multiplicity), though emitted JS is compiler-style rather than hand-authored TS. | Pure functional JS/Node cores |
| **Rocq (Coq)** | **OCaml, Haskell, Scheme** | Mature extraction for FP ecosystems; less direct for Django/Next.js without WASM or `js_of_ocaml`. | Deep formal verification / compiler-style transforms |

---

## Catalog Width: What Maps to Proof-Generated Cores vs. Templates

Mapped against the module catalog in [feature-catalog.md](feature-catalog.md) and the
drafts in [planned-modules/](planned-modules/README.md):

### Tier 1 — High Fit (Pure Verified Core)
Modules whose primary value is deterministic state transitions, constraint solving, or
invariant-preserving math:

- **`workflow-engine`** — Finite-state-machine transition validity and immutable log
  invariants.
- **`rbac` & `multi-tenancy`** — Actor/role/tenant authorization decisions and
  cross-tenant isolation guarantees.
- **`subscriptions` & `metering`** — Proration, quota/tier limits, and non-negative
  balance arithmetic.
- **`rate-limit`** — Token-bucket / sliding-window accounting math.
- **`pagination`** — Cursor encoding/decoding and monotonic ordering invariants.
- **`auth` / `auth-2fa` / `api-keys` cores** — Token state rules, TOTP computation,
  and key validation invariants.
- **`partweave` generator core** (`packages/cli/src/resolve.ts`,
  `packages/cli/src/catalog.ts`) — Proving dependency closure, `conflicts`, `provides`
  uniqueness, and cycle-freedom across the module registry.

### Tier 2 — Partial Fit (Provable Kernel + Hand-Written I/O Adapter)
Modules where the decision/retry/validation kernel can be proved, while network/storage
transport lives in the abstract template shell:

- **`webhooks`, `jobs`, `scheduler`** — Backoff schedules, state transitions, and
  idempotency keys (provable) vs. Celery/Redis/HTTP delivery (template shell).
- **`forms`, `feature-flags`, `auth-email-verify`, `storage`** — Cross-field
  validation, rollout rule evaluation, token expiry, and path-traversal guards (provable)
  vs. React Hook Form / SMTP / S3 / Django ORM bindings (template shell).

### Tier 3 — Template / Infrastructure Only (Outside Proof Scope)
Modules that describe layout, external SaaS wiring, or infrastructure rather than
mathematical invariants—these remain authored directly as standard templates:

- **`docker`, `ci`, `deploy-*`, `eas`** (Dockerfiles, YAML workflows, deploy presets).
- **`ui-kit`, `ui-kit-mobile`, `nativewind`** (Tailwind styles, React/RN components).
- **`db-postgres`, `cache-redis`, `sentry`, `logging`, `metrics`, `analytics`,
  `payments-stripe`, `email`, `sms`, `push`** (framework setup, migrations, vendor SDKs).

---

## The Common Template Builder Pattern

Because every verified core exposes a pure signature such as:

```text
decide(state, input) -> Ok(nextState, effects) | Err(reason)
```

the framework-specific code does not need to be re-invented per module. One common
template builder handles the abstract shell and plugs in the generated core:

1. **Runtime wrapper (inside generated apps):**
   - A shared endpoint/service factory (`loadState` → `verifiedCore` → `persistAndLog` →
     `serializeResponse`) handles transactions, DRF auth, HTTP status mapping, and
     audit/transition persistence.
   - A shared policy/guard wrapper (`extractContext` → `verifiedCheck`) handles Django
     permissions and client route/UI guards.
2. **Module-system integration (inside `partweave`):**
   - Alongside `module.json` ([module-contract.md](module-contract.md)) and the programmatic
     module base classes ([`packages/cli/src/module-system.ts`](../packages/cli/src/module-system.ts)),
     a module can keep a formal spec source (e.g., `.dfy` or `.lean`) whose build step
     emits the runtime `core` artifacts into the module's target folders before `compose`
     and anchor injection run.
   - All existing `wiring` (`installedApps`, `urls`, `providers`, `anchors`) and `enhances`
     soft-joins continue to work unchanged.

---

## Phased Path from v0.6.0 to v2

1. **Phase 1 — Single-kernel proof of concept:** Model one pure kernel (such as
   `workflow-engine` transitions or `resolve.ts` selection/conflict rules) in Dafny or
   Lean 4 and verify its properties in CI alongside existing tests.
2. **Phase 2 — Common runtime template wrapper:** Define the shared Django + TypeScript
   adapter contract so generated pure cores drop cleanly into `apps/server` and
   `packages/shared` without custom boilerplate per module.
3. **Phase 3 — Generator pipeline support:** Add an optional verified-core build hook to
   the module authoring workflow so modules can ship both their formal spec and their
   erased runtime output cleanly inside the published catalog.
