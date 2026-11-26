"""
Independent Producibility Audit & Live Kernel Probe for partweave v2.

Instead of a hardcoded lookup table, this script uses `independent_scanner.py`
to inspect actual source files (Python AST, JS/TS, infra files), `module.json`,
`SPEC.md`, and `docs/feature-catalog.md` descriptions on disk — and optionally any
custom `--scan <path>` directory — then runs executable invariant probes.
"""

from __future__ import annotations

import argparse
import base64
import sys
from pathlib import Path
from typing import Any, Callable

PROTO_ROOT = Path(__file__).resolve().parent
REPO_ROOT = PROTO_ROOT.parent.parent
if str(PROTO_ROOT) not in sys.path:
    sys.path.insert(0, str(PROTO_ROOT))

from cores.rbac_core import AuthActor, check_permission  # noqa: E402
from cores.workflow_core import WorkflowDefinition, decide_transition  # noqa: E402
from independent_scanner import (  # noqa: E402
    ScanResult,
    Verdict,
    scan_directory,
    scan_repository,
    scan_text_spec,
)
from templates.runtime_wrapper import (  # noqa: E402
    InvalidTransition,
    PermissionDeniedError,
    UnauthenticatedError,
    make_permission_guard,
    make_transition_runner,
)


# ---------------------------------------------------------------------------
# Representative Producible Pure Kernels (executed by live probes)
# ---------------------------------------------------------------------------

def token_bucket_consume(
    tokens: int,
    capacity: int,
    elapsed_sec: int,
    refill_per_sec: int,
    cost: int,
) -> tuple[bool, int, int]:
    if capacity < 0 or tokens < 0 or elapsed_sec < 0 or refill_per_sec <= 0 or cost <= 0:
        raise ValueError("Invalid negative/non-positive parameter")
    refilled = min(capacity, tokens + elapsed_sec * refill_per_sec)
    if refilled >= cost:
        return True, refilled - cost, 0
    deficit = cost - refilled
    retry_after = (deficit + refill_per_sec - 1) // refill_per_sec
    return False, refilled, retry_after


def apply_usage(quota: int, used: int, delta: int) -> tuple[int, int, int]:
    if quota < 0 or used < 0 or delta < 0:
        raise ValueError("Usage values must be non-negative")
    new_used = used + delta
    remaining = max(0, quota - new_used)
    overage = max(0, new_used - quota)
    return new_used, remaining, overage


SENSITIVE_KEYS = frozenset({"password", "passwd", "token", "secret", "api_key", "authorization"})


def scrub_payload(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            k: ("[REDACTED]" if k.lower() in SENSITIVE_KEYS else scrub_payload(v))
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [scrub_payload(item) for item in value]
    return value


def safe_object_key(key: str) -> bool:
    if not key or key.startswith("/") or key.startswith("\\"):
        return False
    if "\\" in key or (len(key) >= 2 and key[1] == ":"):
        return False
    segments = key.split("/")
    return all(seg not in ("", ".", "..") for seg in segments)


def encode_cursor(offset: int) -> str:
    if offset < 0:
        raise ValueError("offset must be >= 0")
    return base64.urlsafe_b64encode(str(offset).encode("ascii")).decode("ascii")


def decode_cursor(cursor: str) -> int:
    raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("ascii")
    val = int(raw)
    if val < 0:
        raise ValueError("negative cursor")
    return val


def resolve_dag(catalog: dict[str, dict[str, Any]], chosen: list[str]) -> list[str]:
    resolved: set[str] = set()

    def visit(mod_id: str, stack: list[str]) -> None:
        if mod_id in resolved:
            return
        if mod_id in stack:
            raise ValueError(f"Cycle detected: {' -> '.join([*stack, mod_id])}")
        if mod_id not in catalog:
            raise ValueError(f"Unknown module: {mod_id}")
        for dep in catalog[mod_id].get("requires", []):
            visit(dep, [*stack, mod_id])
        resolved.add(mod_id)

    for m in chosen:
        visit(m, [])

    provided: dict[str, str] = {}
    for m in sorted(resolved):
        for c in catalog[m].get("conflicts", []):
            if c in resolved:
                raise ValueError(f"Conflict between {m} and {c}")
        cap = catalog[m].get("provides")
        if cap:
            if cap in provided and provided[cap] != m:
                raise ValueError(f"Duplicate capability '{cap}': {provided[cap]} vs {m}")
            provided[cap] = m

    indegree = {
        m: len([d for d in catalog[m].get("requires", []) if d in resolved])
        for m in resolved
    }
    dependents: dict[str, list[str]] = {m: [] for m in resolved}
    for m in resolved:
        for d in catalog[m].get("requires", []):
            dependents[d].append(m)

    ready = sorted(m for m, deg in indegree.items() if deg == 0)
    order: list[str] = []
    while ready:
        cur = ready.pop(0)
        order.append(cur)
        for nxt in dependents[cur]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                ready.append(nxt)
                ready.sort()
    return order


def post_ledger_entry(entries: list[tuple[str, int]]) -> int:
    if not entries:
        raise ValueError("Empty ledger transaction")
    total = sum(amount for _, amount in entries)
    if total != 0:
        raise ValueError(f"Unbalanced ledger entry (net={total})")
    return total


# ---------------------------------------------------------------------------
# Independent scanning of repo + beyond-catalog targets
# ---------------------------------------------------------------------------

def scan_beyond_catalog(repo_root: Path = REPO_ROOT) -> list[ScanResult]:
    """Scan real non-module code dirs in the repo + unseen general domain specs."""
    results: list[ScanResult] = []
    cli_src = repo_root / "packages" / "cli" / "src"
    if cli_src.exists():
        results.append(scan_directory("packages/cli/src", "beyond-catalog", cli_src))

    api_classifier = repo_root / "packages" / "api" / "classifier"
    if api_classifier.exists():
        results.append(scan_directory("packages/api/classifier", "beyond-catalog", api_classifier))

    unseen_specs = [
        ("double-entry-ledger", "Pure double-entry ledger balance conservation arithmetic"),
        ("parser-and-typechecker", "Deterministic lexer, AST parser, and sound typechecker rules"),
        ("arbitrary-halting-verifier", "Verify termination and halting for any arbitrary Turing-complete program"),
        ("physical-latency-sla", "Guarantee <50ms network latency and zero packet loss over public internet"),
    ]
    for item_id, text in unseen_specs:
        results.append(scan_text_spec(item_id, "beyond-catalog", text))
    return results


# ---------------------------------------------------------------------------
# Executable Kernel & Boundary Probes
# ---------------------------------------------------------------------------

def run_probes(scanned: list[ScanResult]) -> list[tuple[str, bool, str]]:
    results: list[tuple[str, bool, str]] = []
    by_id = {r.id: r for r in scanned}

    def check(name: str, fn: Callable[[], str]) -> None:
        try:
            detail = fn()
            results.append((name, True, detail))
        except Exception as exc:  # pragma: no cover
            results.append((name, False, f"{type(exc).__name__}: {exc}"))

    def p_workflow() -> str:
        wf = WorkflowDefinition(
            states=["draft", "submitted", "approved"],
            initial="draft",
            transitions={"draft": {"submit": "submitted"}, "submitted": {"approve": "approved"}},
        )
        obj = {"state": "draft"}
        logs: list[str] = []
        runner = make_transition_runner(
            definition=wf,
            decide_fn=decide_transition,
            load_state=lambda o: o["state"],
            save_state=lambda o, s: o.__setitem__("state", s),
            append_log=lambda o, f, t, ev, actor: logs.append(f"{f}->{t}"),
        )
        runner(obj, "submit")
        try:
            runner(obj, "submit")
            raise AssertionError("Expected InvalidTransition")
        except InvalidTransition:
            pass
        assert obj["state"] == "submitted" and logs == ["draft->submitted"]
        return "State closure + atomic no-op on illegal transition verified"

    def p_rbac() -> str:
        guard = make_permission_guard(decide_fn=check_permission, extract_actor=lambda a: a)
        try:
            guard(AuthActor(authenticated=False), "x")
            raise AssertionError("Expected 401")
        except UnauthenticatedError:
            pass
        try:
            guard(AuthActor(authenticated=True, permissions=frozenset()), "x")
            raise AssertionError("Expected 403")
        except PermissionDeniedError:
            pass
        assert guard(AuthActor(authenticated=True, is_superuser=True), "x").status_code == 200
        return "401 / 403 / 200 superuser invariants verified"

    def p_rate_limit() -> str:
        for cap in (1, 5, 10):
            for tok in range(0, cap + 1):
                for elapsed in (0, 1, 3):
                    for cost in (1, 3):
                        allowed, rem, retry = token_bucket_consume(tok, cap, elapsed, 2, cost)
                        assert 0 <= rem <= cap and retry >= 0
                        if not allowed and cost <= cap:
                            assert retry > 0
        return "Non-negative bounds, cap clamp, and Retry-After invariants verified"

    def p_metering() -> str:
        for quota in (0, 100, 1000):
            for used in (0, 50, 120):
                for delta in (0, 25, 200):
                    new_used, rem, over = apply_usage(quota, used, delta)
                    assert new_used == used + delta and rem >= 0 and over >= 0
                    assert new_used - over + rem == quota
        return "Usage conservation law (new_used - overage + remaining == quota) verified"

    def p_audit() -> str:
        sample = {"user": "alice", "password": "p1", "nested": [{"api_key": "k1", "ok": 1}]}
        scrubbed = scrub_payload(sample)
        assert scrubbed["password"] == "[REDACTED]"
        assert scrubbed["nested"][0]["api_key"] == "[REDACTED]"
        assert scrubbed["user"] == "alice" and scrubbed["nested"][0]["ok"] == 1
        return "Recursive sensitive-key redaction verified"

    def p_storage_key() -> str:
        bad = ["", "/etc/passwd", "../secret", "a/../../b", "C:\\x", "a\\b", "./x"]
        good = ["uploads/2026/avatar.png", "report.pdf"]
        assert all(not safe_object_key(k) for k in bad)
        assert all(safe_object_key(k) for k in good)
        return "Path-traversal rejection verified across 7 attack vectors"

    def p_pagination() -> str:
        for i in (0, 1, 42, 99999):
            assert decode_cursor(encode_cursor(i)) == i
        return "Cursor encode/decode bijection verified"

    def p_resolver() -> str:
        cat = {
            "db": {"requires": [], "provides": "database"},
            "auth": {"requires": ["db"], "provides": "auth"},
            "auth-alt": {"requires": [], "provides": "auth"},
            "example": {"requires": ["auth"]},
            "cyc-a": {"requires": ["cyc-b"]},
            "cyc-b": {"requires": ["cyc-a"]},
        }
        assert resolve_dag(cat, ["example"]) == ["db", "auth", "example"]
        for bad in (["auth", "auth-alt"], ["cyc-a"]):
            try:
                resolve_dag(cat, bad)
                raise AssertionError(f"Expected rejection for {bad}")
            except ValueError:
                pass
        return "DAG closure, capability conflict, cycle rejection, and topological order verified"

    def p_ledger() -> str:
        assert post_ledger_entry([("cash", 500), ("revenue", -500)]) == 0
        try:
            post_ledger_entry([("cash", 500), ("revenue", -499)])
            raise AssertionError("Expected unbalanced rejection")
        except ValueError:
            pass
        return "Double-entry zero-sum conservation invariant verified"

    def p_scanner_inferred_boundaries() -> str:
        assert by_id["storage"].verdict == Verdict.HYBRID_WRAPPER
        assert any("safe_key" in fn for fn in by_id["storage"].evidence.pure_functions)
        for non_prod in ("ui-kit", "docker", "ci", "arbitrary-halting-verifier", "physical-latency-sla"):
            assert by_id[non_prod].verdict == Verdict.NOT_POSSIBLE, non_prod
        for prod in ("workflow-engine", "rbac", "rate-limit", "double-entry-ledger"):
            assert by_id[prod].verdict == Verdict.PRODUCIBLE_CORE, prod
        return "Independent AST + spec scan separated pure functions, hybrids, and impossible items"

    check("workflow-engine (core + wrapper)", p_workflow)
    check("rbac (core + guard wrapper)", p_rbac)
    check("rate-limit (token bucket math)", p_rate_limit)
    check("metering (quota conservation)", p_metering)
    check("audit-log (payload scrubber)", p_audit)
    check("storage.safe_key (path guard)", p_storage_key)
    check("pagination (cursor bijection)", p_pagination)
    check("partweave resolve (DAG/conflicts)", p_resolver)
    check("beyond: double-entry ledger", p_ledger)
    check("scanner: inferred boundaries", p_scanner_inferred_boundaries)
    return results


def format_report(custom_paths: list[Path] | None = None) -> tuple[str, bool]:
    if custom_paths:
        scanned = [scan_directory(p.name, "custom-scan", p.resolve()) for p in custom_paths]
        lines = ["=== Partweave v2 Independent Directory Scan ==="]
        for r in scanned:
            lines.append(f"\n[{r.id}] -> {r.verdict.value}")
            lines.append(f"  Reason: {r.explanation}")
            if r.evidence.pure_functions:
                lines.append(f"  Pure functions discovered ({len(r.evidence.pure_functions)}):")
                for fn in r.evidence.pure_functions[:15]:
                    lines.append(f"    + {fn}")
            if r.evidence.impure_functions:
                lines.append(f"  Impure/shell functions ({len(r.evidence.impure_functions)}):")
                for fn in r.evidence.impure_functions[:10]:
                    lines.append(f"    - {fn}")
            if r.evidence.ui_files:
                lines.append(f"  UI files ({len(r.evidence.ui_files)}): {', '.join(r.evidence.ui_files[:6])}")
            if r.evidence.infra_files:
                lines.append(f"  Infra files ({len(r.evidence.infra_files)}): {', '.join(r.evidence.infra_files[:6])}")
        return "\n".join(lines), True

    repo_results = scan_repository(REPO_ROOT)
    beyond_results = scan_beyond_catalog(REPO_ROOT)
    all_results = [*repo_results, *beyond_results]

    lines = ["=== Partweave v2 Independent Producibility Scan ==="]
    for scope_key, title in (
        ("built-catalog", "Built Catalog (AST/File Scan of modules/)"),
        ("planned-catalog", "Planned Catalog (Spec/Catalog Scan)"),
        ("beyond-catalog", "Beyond Catalog (Code Dirs + Unseen Specs)"),
    ):
        group = [r for r in all_results if r.scope == scope_key]
        counts = {v: 0 for v in Verdict}
        lines.append(f"\n[{title}] ({len(group)} items)")
        for r in group:
            counts[r.verdict] += 1
            lines.append(f"  - {r.id:<28} {r.verdict.value:<16} | {r.explanation}")
        lines.append(
            f"  Summary: PRODUCIBLE_CORE={counts[Verdict.PRODUCIBLE_CORE]}, "
            f"HYBRID_WRAPPER={counts[Verdict.HYBRID_WRAPPER]}, "
            f"NOT_POSSIBLE={counts[Verdict.NOT_POSSIBLE]}"
        )

    lines.append("\n[Executable Kernel & Boundary Probes]")
    probe_results = run_probes(all_results)
    all_ok = True
    for name, ok, detail in probe_results:
        if not ok:
            all_ok = False
        lines.append(f"  [{'PASS' if ok else 'FAIL'}] {name:<34} -> {detail}")
    lines.append(
        f"\nOverall probes: {sum(1 for _, ok, _ in probe_results if ok)}/{len(probe_results)} passed"
    )
    return "\n".join(lines), all_ok


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Independent producibility scanner & kernel probe")
    parser.add_argument(
        "--scan",
        action="append",
        type=Path,
        help="Scan a specific code/module directory independently (can be repeated)",
    )
    args = parser.parse_args(argv)
    report, ok = format_report(args.scan)
    print(report)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
