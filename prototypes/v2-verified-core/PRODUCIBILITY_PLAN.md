# Plan: Testing What Proof-Driven Code Can and Cannot Accurately Produce

## Goal

Determine empirically—across the entire `partweave` catalog (`modules/` + `docs/feature-catalog.md`) and domains **beyond** the catalog—which functions can be accurately produced by a mathematical proof writer (Dafny / Lean 4 / F\*) + common template wrapper, and which cannot.

## 1. Classification Rubric (5 Criteria)

Every candidate module or function is scored against five binary properties:

| Criterion | Question |
| --- | --- |
| `pure_logic` | Does the core decision depend only on explicit inputs (no DB, network, filesystem, wall-clock, or DOM)? |
| `formal_spec` | Can correctness be stated as an exact mathematical predicate (`∀ x, P(x) ⇒ Q(f(x))`) rather than visual taste or heuristics? |
| `decidable` | Can invariants be verified/terminating without hitting Rice's theorem / halting undecidability or statistical ML weights? |
| `extractable` | Can a proof writer emit runnable Python / JS / C / WASM without embedding an OS, browser, or SaaS SDK? |
| `shell_separable` | Can any remaining I/O live cleanly inside a thin, reusable template wrapper? |

### Resulting Verdicts
- **`PRODUCIBLE_CORE`**: All 5 hold (`pure_logic`, `formal_spec`, `decidable`, `extractable`, `shell_separable`). Math generates the core engine; a common wrapper handles I/O.
- **`HYBRID_WRAPPER`**: Only a small sub-function (e.g., `safe_key`, token validation, backoff math) satisfies `pure_logic + formal_spec + decidable`; the bulk of the module is framework/SDK/UI code.
- **`NOT_POSSIBLE`**: Lacks a formal mathematical spec (`formal_spec=False`), is dominated by external infra/UI/SDK side effects (`pure_logic=False, shell_separable=False`), or is mathematically undecidable/empirical (`decidable=False`).

## 2. Scope Under Test

1. **Built `partweave` catalog** (`modules/*/module.json`): 8 modules (`auth`, `ci`, `db-postgres`, `docker`, `example`, `feedback`, `storage`, `ui-kit`).
2. **Planned `partweave` catalog** (`docs/feature-catalog.md` + `docs/planned-modules/`): ~32 planned modules across Auth, Data, Comms, Payments, Background/Realtime, Frontend, Ops, and Deploy.
3. **Beyond-catalog domains**:
   - *Producible beyond catalog*: double-entry ledger math, AST/parser & typechecker kernels, cryptographic protocol state machines, policy/ACL engines, constraint/DAG solvers.
   - *Not possible beyond catalog*: visual UI/UX design, empirical ML/NLP classifiers, arbitrary program termination/bug-freedom (halting problem), physical network/latency SLAs, undocumented third-party SaaS SDK behavior.

## 3. Executable Probes

The program (`producibility_probe.py`) will not just classify statically—it will execute **real property & invariant probes** on representative kernels:
1. `workflow-engine`: state closure + atomic no-op on illegal transition.
2. `rbac`: `401` anonymous / `200` superuser / `403` missing permission invariants.
3. `rate-limit` (token bucket): non-negative token bounds + monotonic refill cap.
4. `metering` / `subscriptions`: zero-loss quota conservation + overage calculation.
5. `audit-log` scrubber: recursive redaction of sensitive keys (`password`, `token`, `secret`, `api_key`).
6. `storage.safe_key`: path-traversal rejection (`..`, absolute paths, drive letters).
7. `pagination` cursor: round-trip encode/decode bijection + monotonic bound check.
8. `partweave` `resolve` solver: dependency closure + cycle rejection + conflict detection.
9. Boundary / impossible cases: assert the rubric flags `ui-kit`, `docker`, `ci`, `payments-stripe`, ML classification, and halting-problem verification as `NOT_POSSIBLE`.

## 4. Verification Command

```sh
python3 prototypes/v2-verified-core/producibility_probe.py
python3 -m unittest discover -s prototypes/v2-verified-core/tests -p "test_*.py" -v
```
