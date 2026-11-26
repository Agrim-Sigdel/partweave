"""
Jev (TypeSafe AI) client for classifying project descriptions.

Sends the user's natural-language project description alongside the partweave
module catalog to Jev's System One endpoint. Jev returns structured,
probabilistic decisions — one Noul (yes/no) per module, a Choice for the app
stack, and Scores for complexity/maturity signals.

Falls back to the keyword classifier (mock.py) when TYPESAFE_API_KEY is unset.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import httpx
from django.conf import settings

logger = logging.getLogger(__name__)

JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone"


@dataclass
class ModuleDecision:
    """Whether to include a module and how confident Jev is about it."""

    include: bool
    confidence: float  # 0.0–1.0


@dataclass
class ClassificationResult:
    """Structured output from the classifier."""

    apps: dict[str, bool] = field(default_factory=dict)  # server/web/mobile → bool
    modules: dict[str, ModuleDecision] = field(default_factory=dict)
    complexity: float = 0.5  # 0.0 (trivial) → 1.0 (enterprise)
    maturity: float = 0.5  # 0.0 (MVP) → 1.0 (production)
    using_fallback: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "apps": self.apps,
            "modules": {
                mid: {"include": d.include, "confidence": round(d.confidence, 3)}
                for mid, d in self.modules.items()
            },
            "complexity": round(self.complexity, 3),
            "maturity": round(self.maturity, 3),
            "using_fallback": self.using_fallback,
        }


def _build_questions(catalog: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Build Jev question primitives from the module catalog.

    Each module becomes a Noul ("does this project need X?"), plus we add a
    Choice for the overall stack type and Scores for complexity/maturity.
    """
    questions: dict[str, Any] = {
        "stack_type": {
            "type": "choice",
            "instructions": (
                "What kind of application architecture does this project need? "
                "Pick the single best fit."
            ),
            "options": {
                "api_only": "Backend API only — no web or mobile frontends",
                "fullstack": "Server plus web frontend (and optionally mobile)",
                "mobile_first": "Mobile app is the primary client",
            },
        },
        "complexity": {
            "type": "score",
            "instructions": "How complex is the described project?",
            "low": "Simple CRUD / MVP",
            "high": "Enterprise-grade with multiple integrated subsystems",
        },
        "maturity": {
            "type": "score",
            "instructions": (
                "Does this sound like an early-stage prototype or a production "
                "system that needs operational tooling?"
            ),
            "low": "Quick prototype / hackathon",
            "high": "Production-ready with CI/CD, Docker, monitoring",
        },
    }

    for mod in catalog:
        mid = mod["id"]
        title = mod["title"]
        desc = mod.get("description", "")
        questions[f"needs_{mid}"] = {
            "type": "noul",
            "instructions": (
                f"Does this project need the '{title}' component? "
                f"Description: {desc}"
            ),
        }

    return questions


def classify_with_jev(
    description: str,
    catalog: list[dict[str, Any]],
    temporal_context: dict[str, Any] | None = None,
) -> ClassificationResult:
    """
    Call the Jev API for classification.

    Raises httpx.HTTPError on network/API failures — the caller should catch
    and fall back to the keyword classifier.
    """
    api_key = settings.TYPESAFE_API_KEY
    if not api_key:
        raise ValueError("TYPESAFE_API_KEY not configured")

    # Enrich the state with temporal context so Jev can factor module maturity
    # into its decisions.
    state_parts = [f"Project description: {description}"]
    if temporal_context:
        summaries = []
        for mid, info in temporal_context.items():
            commits = len(info.get("history", []))
            summaries.append(f"- {mid}: {commits} commits tracked")
        if summaries:
            state_parts.append(
                "Module maturity context:\n" + "\n".join(summaries)
            )

    state = "\n\n".join(state_parts)
    questions = _build_questions(catalog)

    response = httpx.post(
        JEV_ENDPOINT,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={"state": state, "questions": questions},
        timeout=10.0,
    )
    response.raise_for_status()
    data = response.json()

    return _parse_jev_response(data, catalog)


def _parse_jev_response(
    data: dict[str, Any], catalog: list[dict[str, Any]]
) -> ClassificationResult:
    """Map Jev's raw response into a ClassificationResult."""
    stack = data.get("stack_type", "fullstack")

    apps = {
        "server": stack in ("api_only", "fullstack"),
        "web": stack == "fullstack",
        "mobile": stack == "mobile_first",
    }
    # Mobile-first still needs a server for the API.
    if stack == "mobile_first":
        apps["server"] = True

    modules: dict[str, ModuleDecision] = {}
    for mod in catalog:
        mid = mod["id"]
        key = f"needs_{mid}"
        if key in data:
            raw = data[key]
            # Jev returns either a bool or a float probability.
            if isinstance(raw, bool):
                modules[mid] = ModuleDecision(include=raw, confidence=1.0 if raw else 0.0)
            elif isinstance(raw, (int, float)):
                modules[mid] = ModuleDecision(include=raw >= 0.5, confidence=float(raw))
            else:
                modules[mid] = ModuleDecision(include=False, confidence=0.0)

    complexity = float(data.get("complexity", 0.5))
    maturity = float(data.get("maturity", 0.5))

    return ClassificationResult(
        apps=apps,
        modules=modules,
        complexity=complexity,
        maturity=maturity,
    )
