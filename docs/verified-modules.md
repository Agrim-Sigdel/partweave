# What Partweave Can Do Now: 24 Modules & Verified Logic Cores

`partweave` now ships **24 selectable feature modules** under `modules/`:

- **8 core infrastructure, auth, storage, UI, and feedback modules**
- **16 verified-core modules** pairing a formal Dafny specification (`spec.dfy`), pure proof-erased runtime cores (`server/<pkg>/core.py` and `shared/src/<slug>.ts`), one of **4 common runtime template wrappers** (`server/<pkg>/wrapper.py`), and module unit tests (`server/tests/test_<pkg>.py`).

## How the 4 Common Wrapper Templates Work

| Wrapper Shape | Responsibility | Modules Using It |
| --- | --- | --- |
| **State-Machine Wrapper** | `loadState -> verifiedTransition -> atomicSave + log` | `workflow-engine`, `subscriptions`, `auth-2fa`, `quorum` |
| **Policy / Guard Wrapper** | `extractActor/Context -> verifiedCheck -> Allow \| 401 \| 403` | `rbac`, `multi-tenancy`, `api-keys`, `quorum` |
| **Counter / Quota / Ledger Wrapper** | `loadCounters -> verifiedMath -> atomicCommit` | `metering`, `rate-limit`, `ledger`, `pricing`, `reservations` |
| **Pure Transform / Validator Wrapper** | `input -> verifiedTransform -> cleanOutput \| Error` | `audit-log`, `pagination`, `filter-eval`, `resolve-dag` |

## Complete Catalog of Verified-Core Modules

### Promoted from the Planned Catalog (10)

| Module | Server Package | Shared Export | Verified Guarantees |
| --- | --- | --- | --- |
| `workflow-engine` | `workflow_engine` | `workflow-engine.ts` | Legal transitions, state closure, atomic no-op on error |
| `rbac` | `rbac` | `rbac.ts` | `401` anonymous, `200` superuser/granted, `403` missing permission |
| `multi-tenancy` | `multi_tenancy` | `multi-tenancy.ts` | Membership + active-tenant cross-tenant isolation |
| `api-keys` | `api_keys` | `api-keys.ts` | Prefix match, non-revoked, non-expired, required scope subset |
| `audit-log` | `audit_log` | `audit-log.ts` | Recursive sensitive-key redaction + deterministic diff |
| `pagination` | `pagination_core` | `pagination.ts` | Limit clamping, cursor bijection, bounded slice window |
| `subscriptions` | `subscriptions` | `subscriptions.ts` | Lifecycle transitions (`canceled` terminal) + integer proration |
| `metering` | `metering` | `metering.ts` | Conservation invariant: `new_used - overage + remaining == quota` |
| `rate-limit` | `rate_limit` | `rate-limit.ts` | Clamped token bucket `[0, capacity]` + `Retry-After` ceiling |
| `auth-2fa` | `auth_2fa` | `auth-2fa.ts` | RFC-6238 TOTP step window + single-use backup-code removal |

### New Beyond-Catalog Domain Modules (6)

| Module | Server Package | Shared Export | Verified Guarantees |
| --- | --- | --- | --- |
| `ledger` | `ledger` | `ledger.ts` | Zero-sum double-entry (`debits == credits`) + negative-balance guard |
| `pricing` | `pricing` | `pricing.ts` | Clamped discounts (`<= subtotal`), integer-cent tax & non-negative total |
| `reservations` | `reservations` | `reservations.ts` | Half-open `[start, end)` overlap check + stock conservation |
| `quorum` | `quorum` | `quorum.ts` | Unique voter enforcement + `k-of-n` approval/rejection closure |
| `filter-eval` | `filter_eval` | `filter-eval.ts` | Field-allowlisted, bounded-depth AST evaluation with zero `eval()` |
| `resolve-dag` | `resolve_dag` | `resolve-dag.ts` | Transitive dependency closure, cycle/conflict rejection, topological sort |

## Quick Usage

```sh
# Scaffold a project with any subset of verified-core modules
partweave create my-saas --dir /tmp/my-saas --server --web \
  --with workflow-engine,rbac,rate-limit,audit-log,ledger,pricing

# Or add verified modules to an existing partweave project later
cd /tmp/my-saas && partweave add subscriptions metering
```

All Python cores work standalone with zero Postgres/Redis dependency by default, and expose clean callback hooks (`load_*`, `save_*`, `atomic_ctx`) so you can wire Django ORM models, `transaction.atomic()`, or Redis into the wrapper without rewriting the verified rules.

