"""
Independent Static & Spec Producibility Scanner.

Inspects actual files on disk (Python AST, JS/TS source, infra files, module.json,
SPEC.md, and docs/feature-catalog.md rows) WITHOUT any hardcoded module-ID lookup
table, and infers:
  1. Which functions/files can be produced by a proof writer (`pure_functions`),
  2. Which parts are framework/I/O/UI/infra/empirical (`impure_or_shell_signals`),
  3. The 5 criteria and final Verdict (`PRODUCIBLE_CORE`, `HYBRID_WRAPPER`, `NOT_POSSIBLE`).
"""

from __future__ import annotations

import ast
import json
import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Iterable


class Verdict(str, Enum):
    PRODUCIBLE_CORE = "PRODUCIBLE_CORE"
    HYBRID_WRAPPER = "HYBRID_WRAPPER"
    NOT_POSSIBLE = "NOT_POSSIBLE"


@dataclass(frozen=True)
class Criteria:
    pure_logic: bool
    formal_spec: bool
    decidable: bool
    extractable: bool
    shell_separable: bool


@dataclass
class ScanEvidence:
    item_id: str
    source_kind: str  # "code-dir" | "spec-doc" | "catalog-row"
    pure_functions: list[str] = field(default_factory=list)
    impure_functions: list[str] = field(default_factory=list)
    ui_files: list[str] = field(default_factory=list)
    infra_files: list[str] = field(default_factory=list)
    config_only_files: list[str] = field(default_factory=list)
    rule_signals: list[str] = field(default_factory=list)
    shell_signals: list[str] = field(default_factory=list)
    undecidable_signals: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ScanResult:
    id: str
    scope: str
    criteria: Criteria
    verdict: Verdict
    evidence: ScanEvidence
    explanation: str


def classify(c: Criteria) -> Verdict:
    if c.pure_logic and c.formal_spec and c.decidable and c.extractable and c.shell_separable:
        return Verdict.PRODUCIBLE_CORE
    if c.formal_spec and c.decidable and c.extractable and (c.pure_logic or c.shell_separable):
        return Verdict.HYBRID_WRAPPER
    return Verdict.NOT_POSSIBLE


# ---------------------------------------------------------------------------
# Generic domain/code signal patterns (never keyed by module ID)
# ---------------------------------------------------------------------------

IMPURE_PY_MODULES = {
    "django", "rest_framework", "os", "sys", "pathlib", "shutil", "subprocess",
    "socket", "http", "urllib", "requests", "httpx", "boto3", "botocore",
    "sqlite3", "psycopg", "psycopg2", "redis", "celery", "time", "datetime",
    "random", "secrets", "uuid", "logging", "tempfile", "io",
}

IMPURE_PY_CALLS = {
    "open", "print", "input", "exec", "eval", "getenv", "environ",
    "save", "delete", "create", "update", "filter", "get_object_or_404",
    "atomic", "send_mail", "post", "get", "put", "patch", "fetch",
}

ML_OR_UNDECIDABLE_PY = {
    "torch", "tensorflow", "keras", "sklearn", "transformers", "openai",
    "anthropic", "google.generativeai", "numpy", "scipy",
}

IMPURE_JS_MARKERS = (
    "fetch(", "axios", "localStorage", "sessionStorage", "window.", "document.",
    "node:", "fs.", "existsSync", "readFileSync", "writeFileSync", "mkdirSync",
    "rmSync", "execSync", "spawn", "process.env", "process.exit", "process.argv",
    "console.", "@clack/prompts", "commander", "expo-secure-store", "AsyncStorage",
)

UI_JS_MARKERS = (
    "from \"react\"", "from 'react'", "from \"react-native\"", "from 'react-native'",
    "from \"next/", "from 'next/", "className=", "StyleSheet.create",
    "cva(", "@radix-ui/", "lucide-react", "tailwind-merge", "clsx",
)

INFRA_FILE_NAMES = {
    "dockerfile", "docker-compose.yml", "docker-compose.yaml", "makefile",
    "eas.json", "vercel.json", "fly.toml", "railway.json", "render.yaml",
}

PURE_RULE_PATTERNS: list[tuple[str, str]] = [
    (r"\b(finite[- ]state|state[- ]machine|transitions?|lifecycle)\b", "state-machine"),
    (r"\b(rbac|roles?|permissions?|authorization|is_superuser|policy|guard|tenant|isolation)\b", "policy-rules"),
    (r"\b(rate[- ]limit|throttl\w*|token bucket|sliding window|quota|metering|usage[- ]based)\b", "quota-math"),
    (r"\b(subscription\w*|proration|billing|ledger|balance|double[- ]entry)\b", "financial-math"),
    (r"\b(audit|redact\w*|scrub\w*|immutable)\b", "audit-invariants"),
    (r"\b(pagination|cursor|monotonic|offset)\b", "cursor-math"),
    (r"\b(totp|two[- ]factor|2fa|api[- ]key\w*|expiry|expir\w*|revocation|scope)\b", "token-rules"),
    (r"\b(dag|dependency|dependencies|topological|cycle|conflict\w*|resolver?)\b", "graph-solver"),
    (r"\b(validat\w*|sanitiz\w*|path[- ]traversal|safe_key|schema|cross[- ]field)\b", "validation"),
    (r"\b(cron|backoff|retry|idempoten\w*|hash[- ]bucket|targeting|rollout)\b", "deterministic-rules"),
    (r"\b(parser?|ast|lexer|typecheck\w*|grammar)\b", "formal-language"),
]

SHELL_ONLY_PATTERNS: list[tuple[str, str]] = [
    (r"\b(docker|compose|container|kubernetes|deploy|railway|render|fly|vercel|eas)\b", "infra-deploy"),
    (r"\b(github actions|workflow|ci|yaml)\b", "ci-yaml"),
    (r"\b(tailwind|nativewind|ui[- ]kit|button|badge|card|styling|palette|dark:|theme|screen|form ux)\b", "visual-ui"),
    (r"\b(postgres|redis|driver|cache backend|orm|migration\w*|queryset|database)\b", "db-cache-driver"),
    (r"\b(stripe|twilio|sendgrid|smtp|ses|oauth|google/apple/github|posthog|sentry|prometheus|analytics|push)\b", "third-party-sdk"),
    (r"\b(websocket|channels|celery|rq|django-q|worker|daemon|healthz|liveness|readiness|logging|metrics|routing|versioning)\b", "ops-transport"),
    (r"\b(tanstack|zustand|react-hook-form|i18n|localization|translation|locale)\b", "client-framework"),
]

UNDECIDABLE_PATTERNS: list[tuple[str, str]] = [
    (r"\b(classifier|machine learning|neural|llm|semantic|embedding|nlp|heuristic|ai model|prompting)\b", "empirical-ml"),
    (r"\b(halting|arbitrary program|turing[- ]complete|rice'?s theorem)\b", "undecidable-halting"),
    (r"\b(network latency|sla|packet loss|clock drift|physical)\b", "physical-environment"),
]


# ---------------------------------------------------------------------------
# Code & file scanners
# ---------------------------------------------------------------------------

def _is_test_or_migration(rel_path: str) -> bool:
    norm = rel_path.replace("\\", "/").lower()
    parts = norm.split("/")
    if "migrations" in parts or "__pycache__" in parts or "node_modules" in parts:
        return True
    name = parts[-1]
    return (
        name.startswith("test_")
        or name == "tests.py"
        or ".test." in name
        or ".spec." in name
        or name in {"__init__.py", "apps.py", "admin.py", "wsgi.py", "asgi.py", "manage.py"}
    )


def _scan_python_file(path: Path, rel: str, ev: ScanEvidence) -> None:
    src = path.read_text(encoding="utf-8", errors="replace")
    try:
        tree = ast.parse(src)
    except SyntaxError:
        ev.config_only_files.append(rel)
        return

    imported_roots: set[str] = set()
    ml_hits: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                imported_roots.add(root)
                if alias.name in ML_OR_UNDECIDABLE_PY or root in ML_OR_UNDECIDABLE_PY:
                    ml_hits.add(root)
        elif isinstance(node, ast.ImportFrom) and node.module:
            root = node.module.split(".")[0]
            imported_roots.add(root)
            if node.module in ML_OR_UNDECIDABLE_PY or root in ML_OR_UNDECIDABLE_PY:
                ml_hits.add(root)

    if ml_hits:
        ev.undecidable_signals.append(f"{rel}:ml({','.join(sorted(ml_hits))})")

    file_has_impure_import = bool(imported_roots & IMPURE_PY_MODULES)

    funcs: list[tuple[str, ast.FunctionDef | ast.AsyncFunctionDef]] = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            funcs.append((node.name, node))
        elif isinstance(node, ast.ClassDef):
            for child in node.body:
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    funcs.append((f"{node.name}.{child.name}", child))

    if not funcs:
        # e.g. settings/config/urls declarations
        if file_has_impure_import or "urlpatterns" in src or "DATABASES" in src:
            ev.config_only_files.append(rel)
        return

    for qual_name, fn in funcs:
        if qual_name.endswith(("__str__", "__repr__")):
            continue
        # Skip abstract stubs (`@abstractmethod`, docstring-only, `pass`, `...`).
        is_abstract = any(
            (isinstance(d, ast.Name) and d.id == "abstractmethod")
            or (isinstance(d, ast.Attribute) and d.attr == "abstractmethod")
            for d in fn.decorator_list
        )
        body_no_doc = [
            stmt for stmt in fn.body
            if not (isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Constant) and isinstance(stmt.value.value, str))
        ]
        if is_abstract or not body_no_doc:
            continue
        if len(body_no_doc) == 1 and isinstance(body_no_doc[0], ast.Pass):
            continue
        if (
            len(body_no_doc) == 1
            and isinstance(body_no_doc[0], ast.Expr)
            and isinstance(body_no_doc[0].value, ast.Constant)
            and body_no_doc[0].value.value is Ellipsis
        ):
            continue

        reasons: list[str] = []
        if isinstance(fn, ast.AsyncFunctionDef):
            reasons.append("async-io")

        # Check calls & attribute access inside function body
        for sub in ast.walk(fn):
            if isinstance(sub, ast.Name) and sub.id in IMPURE_PY_MODULES:
                reasons.append(sub.id)
            elif isinstance(sub, ast.Attribute) and sub.attr in {"objects", "META", "FILES", "user"}:
                reasons.append(sub.attr)
            elif isinstance(sub, ast.Call):
                if isinstance(sub.func, ast.Name):
                    if sub.func.id in {"open", "print", "input", "exec", "eval"}:
                        reasons.append(sub.func.id)
                    if sub.func.id in {"eval", "exec"}:
                        ev.undecidable_signals.append(f"{rel}:{qual_name}:dynamic-eval")
                elif isinstance(sub.func, ast.Attribute):
                    if sub.func.attr in {"save", "delete", "create", "update", "filter", "get_object_or_404", "atomic", "send_mail"}:
                        reasons.append(sub.func.attr)
                    elif (
                        sub.func.attr in {"get", "post", "put", "patch", "fetch"}
                        and isinstance(sub.func.value, ast.Name)
                        and sub.func.value.id in {"requests", "httpx", "client", "session", "urllib"}
                    ):
                        reasons.append(sub.func.attr)

        # Django views/serializers/models are framework-coupled even if compact
        lower_name = path.name.lower()
        if lower_name in {"views.py", "models.py", "serializers.py", "urls.py", "middleware.py"}:
            reasons.append(f"django-{lower_name}")

        # Pure functions don't touch external modules/calls and don't depend on ML
        if reasons or ml_hits:
            ev.impure_functions.append(f"{rel}:{qual_name} ({','.join(sorted(set(reasons or ml_hits)))})")
        else:
            ev.pure_functions.append(f"{rel}:{qual_name}")


def _scan_js_ts_file(path: Path, rel: str, ev: ScanEvidence) -> None:
    src = path.read_text(encoding="utf-8", errors="replace")
    is_ui = path.suffix in {".tsx", ".jsx"} or any(m in src for m in UI_JS_MARKERS)
    if is_ui:
        ev.ui_files.append(rel)
        return

    has_impure = any(m in src for m in IMPURE_JS_MARKERS)
    # Extract exported function/const-arrow names
    exported_fns = re.findall(
        r"export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)|export\s+const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(",
        src,
    )
    names = [a or b for a, b in exported_fns]
    if not names:
        ev.config_only_files.append(rel)
        return

    for fn_name in names:
        if has_impure or "export interface" in src and len(names) == 0:
            ev.impure_functions.append(f"{rel}:{fn_name} (js-io)")
        else:
            ev.pure_functions.append(f"{rel}:{fn_name}")


def _scan_text_signals(text: str, ev: ScanEvidence) -> None:
    lower = text.lower()
    for pattern, tag in PURE_RULE_PATTERNS:
        if re.search(pattern, lower):
            ev.rule_signals.append(tag)
    for pattern, tag in SHELL_ONLY_PATTERNS:
        if re.search(pattern, lower):
            ev.shell_signals.append(tag)
    for pattern, tag in UNDECIDABLE_PATTERNS:
        if re.search(pattern, lower):
            ev.undecidable_signals.append(tag)


# ---------------------------------------------------------------------------
# Independent directory / spec / catalog evaluators
# ---------------------------------------------------------------------------

def scan_directory(item_id: str, scope: str, directory: Path) -> ScanResult:
    """Independently classify any module or code directory by inspecting its files."""
    ev = ScanEvidence(item_id=item_id, source_kind="code-dir")

    manifest_path = directory / "module.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        _scan_text_signals(
            f"{manifest.get('title', '')} {manifest.get('description', '')}",
            ev,
        )
        for key in ("deps",):
            pass

    for path in sorted(directory.rglob("*")):
        if not path.is_file():
            continue
        rel = str(path.relative_to(directory))
        if rel == "module.json" or _is_test_or_migration(rel):
            continue
        low_name = path.name.lower()
        if (
            low_name in INFRA_FILE_NAMES
            or path.suffix in {".yml", ".yaml", ".toml"}
            or ".github/" in rel
            or "infra/" in rel
        ):
            ev.infra_files.append(rel)
        elif path.suffix == ".py":
            _scan_python_file(path, rel, ev)
        elif path.suffix in {".ts", ".tsx", ".js", ".jsx", ".mjs"}:
            _scan_js_ts_file(path, rel, ev)

    # Also inspect module.json env/wiring hints if directory had very few code files
    has_pure = len(ev.pure_functions) > 0
    has_formal_spec = (directory / "spec.dfy").exists() or (directory / "spec.lean").exists()
    only_thin_wrapper_impure = (
        len(ev.ui_files) == 0
        and len(ev.infra_files) == 0
        and len(ev.config_only_files) == 0
        and all("wrapper.py:" in fn for fn in ev.impure_functions)
    )
    has_impure = len(ev.impure_functions) > 0 or len(ev.ui_files) > 0 or len(ev.infra_files) > 0 or len(ev.config_only_files) > 0
    has_undecidable = len(ev.undecidable_signals) > 0

    if has_undecidable:
        criteria = Criteria(
            pure_logic=False,
            formal_spec=False,
            decidable=False,
            extractable=False,
            shell_separable=False,
        )
        reason = f"Undecidable/empirical signals detected: {', '.join(ev.undecidable_signals[:3])}"
    elif has_pure and (not has_impure or (has_formal_spec and only_thin_wrapper_impure)):
        criteria = Criteria(True, True, True, True, True)
        reason = (
            f"Found {len(ev.pure_functions)} pure function(s) "
            f"({', '.join(ev.pure_functions[:3])})"
            + (" with formal spec + thin wrapper." if has_formal_spec else " with no I/O or UI coupling.")
        )
    elif has_pure and has_impure:
        # Pure core exists alongside framework/UI/infra shell; check if pure functions are substantive
        criteria = Criteria(
            pure_logic=False,
            formal_spec=True,
            decidable=True,
            extractable=True,
            shell_separable=True,
        )
        reason = (
            f"Mixed: {len(ev.pure_functions)} pure function(s) [{', '.join(ev.pure_functions[:2])}] "
            f"alongside {len(ev.impure_functions) + len(ev.ui_files) + len(ev.config_only_files)} shell/UI/config item(s)."
        )
    elif ev.rule_signals and not ev.ui_files and not ev.infra_files and not ev.impure_functions:
        # e.g. spec-only directory
        criteria = Criteria(True, True, True, True, True)
        reason = f"Pure spec signals: {', '.join(sorted(set(ev.rule_signals)))}"
    else:
        criteria = Criteria(
            pure_logic=False,
            formal_spec=False,
            decidable=True,
            extractable=False,
            shell_separable=False,
        )
        parts: list[str] = []
        if ev.infra_files:
            parts.append(f"{len(ev.infra_files)} infra file(s)")
        if ev.ui_files:
            parts.append(f"{len(ev.ui_files)} UI file(s)")
        if ev.impure_functions:
            parts.append(f"{len(ev.impure_functions)} I/O-bound function(s)")
        if ev.config_only_files:
            parts.append(f"{len(ev.config_only_files)} config/wiring file(s)")
        reason = f"No standalone pure logic core detected ({', '.join(parts) or 'wiring only'})."

    return ScanResult(
        id=item_id,
        scope=scope,
        criteria=criteria,
        verdict=classify(criteria),
        evidence=ev,
        explanation=reason,
    )


def scan_text_spec(item_id: str, scope: str, text: str, targets: Iterable[str] = ()) -> ScanResult:
    """Independently classify a planned SPEC.md or catalog description from its content."""
    ev = ScanEvidence(item_id=item_id, source_kind="spec-doc")
    _scan_text_signals(text, ev)
    target_set = set(targets)

    # Multi-client UI-only targets without server/shared rules tend to be UI/framework shells
    rule_set = sorted(set(ev.rule_signals))
    shell_set = sorted(set(ev.shell_signals))
    undecidable_set = sorted(set(ev.undecidable_signals))

    # Infra / UI / SDK dominance vs pure algorithmic kernel
    pure_dominant_tags = {
        "state-machine", "policy-rules", "quota-math", "financial-math",
        "audit-invariants", "cursor-math", "token-rules", "graph-solver", "formal-language",
    }
    has_dominant_pure_tag = bool(set(rule_set) & pure_dominant_tags)
    has_any_rule = len(rule_set) > 0
    has_ui_or_infra_or_vendor = bool(
        set(shell_set) & {"infra-deploy", "ci-yaml", "visual-ui", "third-party-sdk", "client-framework", "ops-transport"}
    )

    if undecidable_set:
        criteria = Criteria(False, False, False, False, False)
        reason = f"Undecidable/empirical domain signals: {', '.join(undecidable_set)}"
    elif has_dominant_pure_tag and "visual-ui" not in shell_set and "infra-deploy" not in shell_set:
        # Check if dominated by third-party vendor/gateway transport (e.g., Stripe checkout/webhooks)
        if "third-party-sdk" in shell_set and not (set(rule_set) & {"financial-math", "quota-math"}):
            criteria = Criteria(False, True, True, True, True)
            reason = f"Provable rules ({', '.join(rule_set)}) embedded in third-party SDK flow ({', '.join(shell_set)})."
        elif "third-party-sdk" in shell_set and "financial-math" in rule_set and "proration" not in text.lower():
            criteria = Criteria(False, False, True, False, False)
            reason = f"Dominated by external third-party SDK ({', '.join(shell_set)})."
        else:
            criteria = Criteria(True, True, True, True, True)
            reason = f"Core algorithmic/invariant signals ({', '.join(rule_set)}); framework I/O ({', '.join(shell_set) or 'none'}) fits thin template shell."
    elif has_any_rule and not ("infra-deploy" in shell_set or "ci-yaml" in shell_set):
        if "third-party-sdk" in shell_set and not (set(rule_set) & {"validation", "deterministic-rules"}):
            criteria = Criteria(False, False, True, False, False)
            reason = f"Dominated by third-party vendor protocol ({', '.join(shell_set)})."
        else:
            criteria = Criteria(False, True, True, True, True)
            reason = f"Partial provable slice ({', '.join(rule_set)}) inside shell ({', '.join(shell_set) or ','.join(sorted(target_set)) or 'app'})."
    else:
        criteria = Criteria(False, False, True, False, False)
        reason = f"Non-mathematical / shell-only signals ({', '.join(shell_set) or 'config/plumbing'})."

    return ScanResult(
        id=item_id,
        scope=scope,
        criteria=criteria,
        verdict=classify(criteria),
        evidence=ev,
        explanation=reason,
    )


def scan_repository(repo_root: Path) -> list[ScanResult]:
    """
    Scan all built modules (`modules/`), planned modules (`docs/planned-modules/` +
    `docs/feature-catalog.md`), and extra repo code directories independently.
    """
    results: list[ScanResult] = []

    # 1. Built modules: inspect actual code files under modules/<id>/
    modules_dir = repo_root / "modules"
    for manifest_path in sorted(modules_dir.glob("*/module.json")):
        mod_dir = manifest_path.parent
        if mod_dir.name.startswith("_"):
            continue
        results.append(scan_directory(mod_dir.name, "built-catalog", mod_dir))

    # 2. Planned modules: prefer SPEC.md in docs/planned-modules/<id>/ when present,
    #    otherwise parse the row text from docs/feature-catalog.md.
    planned_dir = repo_root / "docs" / "planned-modules"
    catalog_md = (repo_root / "docs" / "feature-catalog.md").read_text(encoding="utf-8")
    seen_planned: set[str] = set()
    for line in catalog_md.splitlines():
        if "| [planned]" not in line:
            continue
        cells = [c.strip() for c in line.split("|")]
        if len(cells) < 5:
            continue
        ids = re.findall(r"`([a-z0-9-]+)`", cells[1])
        # Strip dependency annotations ("requires ...", "conflicts ...") from Notes
        # so a module isn't penalized for a dependency's SDK/protocol.
        raw_notes = re.sub(r"\b(?:requires|conflicts with)\b[^;.]*", "", cells[4], flags=re.IGNORECASE)
        desc_text = f"{cells[2]} {raw_notes}".strip()
        targets = [t.strip() for t in cells[3].split(",") if t.strip()]
        for mod_id in ids:
            if mod_id in seen_planned:
                continue
            seen_planned.add(mod_id)
            spec_path = planned_dir / mod_id / "SPEC.md"
            if spec_path.exists():
                spec_text = spec_path.read_text(encoding="utf-8")
                results.append(scan_text_spec(mod_id, "planned-catalog", spec_text, targets))
            else:
                results.append(scan_text_spec(mod_id, "planned-catalog", f"{mod_id} {desc_text}", targets))

    return results
