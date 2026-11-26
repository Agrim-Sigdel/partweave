"""
Keyword-based fallback classifier.

Used when TYPESAFE_API_KEY is not set. Maps keywords in the user's project
description to partweave modules using simple heuristic matching. Not as
smart as Jev, but deterministic and zero-latency.
"""

from __future__ import annotations

import re
from typing import Any

from .jev_client import ClassificationResult, ModuleDecision

# Keyword → module id mappings. Each keyword list is checked against the
# lowercased description; a match bumps that module's confidence.
_MODULE_KEYWORDS: dict[str, list[str]] = {
    "auth": [
        "auth", "login", "signup", "sign up", "register", "password",
        "user account", "jwt", "token", "session", "oauth", "sso",
        "authentication", "credential",
    ],
    "db-postgres": [
        "database", "postgres", "postgresql", "sql", "relational",
        "query", "orm", "model", "schema", "migration", "data store",
    ],
    "storage": [
        "upload", "file", "image", "photo", "media", "attachment",
        "s3", "bucket", "blob", "document upload", "asset",
    ],
    "docker": [
        "docker", "container", "deploy", "deployment", "kubernetes",
        "k8s", "devops", "infrastructure",
    ],
    "ci": [
        "ci", "cd", "pipeline", "github actions", "continuous integration",
        "automated test", "build pipeline",
    ],
    "rbac": [
        "role", "permission", "access control", "rbac", "admin",
        "authorization", "privilege", "policy",
    ],
    "rate-limit": [
        "rate limit", "throttle", "abuse", "ddos", "api limit",
        "request limit",
    ],
    "audit-log": [
        "audit", "log", "trail", "compliance", "history", "tracking",
        "record keeping",
    ],
    "feedback": [
        "feedback", "review", "rating", "comment", "survey",
        "user feedback", "nps",
    ],
    "workflow-engine": [
        "workflow", "pipeline", "state machine", "approval",
        "multi-step", "orchestration", "process",
    ],
    "example": [
        "example", "demo", "sample", "tutorial", "starter",
    ],
}

# Keywords that signal which apps to include.
_APP_KEYWORDS: dict[str, list[str]] = {
    "server": [
        "api", "backend", "server", "rest", "graphql", "endpoint",
        "database", "django",
    ],
    "web": [
        "web", "website", "dashboard", "portal", "frontend", "browser",
        "next.js", "react", "saas", "webapp", "web app",
    ],
    "mobile": [
        "mobile", "app", "ios", "android", "expo", "react native",
        "phone", "tablet",
    ],
}

# Keywords that push toward higher complexity/maturity scores.
_COMPLEXITY_SIGNALS = [
    "enterprise", "large scale", "multi-tenant", "microservice",
    "complex", "advanced", "scalable",
]
_MATURITY_SIGNALS = [
    "production", "deploy", "ci/cd", "monitoring", "docker",
    "kubernetes", "staging", "devops", "infrastructure",
]


def _keyword_score(text: str, keywords: list[str]) -> float:
    """Count how many keywords appear in text, normalize to 0.0–1.0."""
    text_lower = text.lower()
    hits = sum(1 for kw in keywords if kw in text_lower)
    if not keywords:
        return 0.0
    # Saturate at ~3 hits → confidence 0.9+
    return min(hits / 3.0, 1.0) * 0.9 + (0.1 if hits > 0 else 0.0)


def classify_with_keywords(
    description: str,
    catalog: list[dict[str, Any]],
) -> ClassificationResult:
    """
    Classify a project description using keyword matching.

    Returns the same ClassificationResult shape as the Jev client so the
    caller doesn't need to care which backend was used.
    """
    desc_lower = description.lower()

    # --- Apps ---
    apps: dict[str, bool] = {}
    for app, keywords in _APP_KEYWORDS.items():
        score = _keyword_score(description, keywords)
        apps[app] = score >= 0.3

    # If nothing matched, default to fullstack.
    if not any(apps.values()):
        apps = {"server": True, "web": True, "mobile": False}

    # Server is almost always needed if any module is selected.
    if apps.get("web") or apps.get("mobile"):
        apps["server"] = True

    # --- Modules ---
    catalog_ids = {m["id"] for m in catalog}
    modules: dict[str, ModuleDecision] = {}
    for mid, keywords in _MODULE_KEYWORDS.items():
        if mid not in catalog_ids:
            continue
        confidence = _keyword_score(description, keywords)
        modules[mid] = ModuleDecision(
            include=confidence >= 0.3,
            confidence=round(confidence, 3),
        )

    # Auto-include db-postgres if auth is included (it requires it).
    if modules.get("auth", ModuleDecision(False, 0)).include:
        if "db-postgres" in catalog_ids:
            pg = modules.get("db-postgres", ModuleDecision(False, 0))
            if not pg.include:
                modules["db-postgres"] = ModuleDecision(include=True, confidence=0.8)

    # --- Scores ---
    complexity = min(
        sum(1 for s in _COMPLEXITY_SIGNALS if s in desc_lower) / 3.0, 1.0
    )
    maturity = min(
        sum(1 for s in _MATURITY_SIGNALS if s in desc_lower) / 3.0, 1.0
    )

    return ClassificationResult(
        apps=apps,
        modules=modules,
        complexity=round(complexity, 3),
        maturity=round(maturity, 3),
        using_fallback=True,
    )
