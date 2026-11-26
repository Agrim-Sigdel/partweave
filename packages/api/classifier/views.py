"""
API views for the classification service.

Endpoints:
  POST /api/classify  — classify a project description → Selection
  GET  /api/catalog   — list available modules
  GET  /api/history   — temporal index of all modules
  GET  /api/history/<module_id> — commit history for one module
  GET  /               — mock UI (served by config/urls.py)
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods

from .indexer import build_temporal_index, get_module_history
from .jev_client import classify_with_jev
from .mock import classify_with_keywords

logger = logging.getLogger(__name__)


def _load_catalog() -> list[dict[str, Any]]:
    """Load module manifests from the modules/ directory."""
    modules_dir = Path(settings.PARTWEAVE_MODULES_DIR)
    catalog: list[dict[str, Any]] = []

    if not modules_dir.is_dir():
        return catalog

    for child in sorted(modules_dir.iterdir()):
        if not child.is_dir() or child.name.startswith((".", "_")):
            continue
        manifest_path = child / "module.json"
        if not manifest_path.exists():
            continue
        try:
            manifest = json.loads(manifest_path.read_text())
            catalog.append(manifest)
        except (json.JSONDecodeError, OSError):
            logger.warning("Skipping unreadable manifest: %s", manifest_path)

    return catalog


@csrf_exempt
@require_http_methods(["POST"])
def classify(request):
    """
    POST /api/classify

    Body: {"description": "I'm building a SaaS app with..."}
    Returns: {
        "ok": true,
        "result": {
            "apps": {"server": true, "web": true, "mobile": false},
            "modules": {"auth": {"include": true, "confidence": 0.92}, ...},
            "complexity": 0.72,
            "maturity": 0.5,
            "using_fallback": false
        },
        "selection": {
            "apps": ["server", "web"],
            "modules": ["auth", "db-postgres", "storage"],
            "cli_command": "partweave create my-app --server --web --with auth,db-postgres,storage"
        }
    }
    """
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse(
            {"ok": False, "error": "Invalid JSON body"}, status=400
        )

    description = body.get("description", "").strip()
    if not description:
        return JsonResponse(
            {"ok": False, "error": "Missing 'description' field"}, status=400
        )

    catalog = _load_catalog()

    # Try Jev first, fall back to keywords.
    result = None
    if settings.TYPESAFE_API_KEY:
        try:
            temporal = build_temporal_index()
            result = classify_with_jev(
                description,
                catalog,
                temporal_context=temporal.get("modules"),
            )
        except Exception:
            logger.exception("Jev API call failed, falling back to keywords")

    if result is None:
        result = classify_with_keywords(description, catalog)

    # Build the concrete selection and CLI command.
    selected_apps = [app for app, on in result.apps.items() if on]
    selected_modules = [
        mid for mid, dec in result.modules.items() if dec.include
    ]

    app_flags = " ".join(f"--{app}" for app in selected_apps)
    with_flag = f" --with {','.join(selected_modules)}" if selected_modules else ""
    cli_command = f"partweave create my-app {app_flags}{with_flag}"

    return JsonResponse({
        "ok": True,
        "result": result.to_dict(),
        "selection": {
            "apps": selected_apps,
            "modules": selected_modules,
            "cli_command": cli_command.strip(),
        },
    })


@require_GET
def catalog(request):
    """GET /api/catalog — list available modules."""
    modules = _load_catalog()
    # Slim down to the fields a consumer needs.
    items = [
        {
            "id": m["id"],
            "title": m["title"],
            "description": m.get("description", ""),
            "kind": m.get("kind", "feature"),
            "targets": m.get("targets", []),
            "requiresApps": m.get("requiresApps", []),
            "requires": m.get("requires", []),
            "default": m.get("default", False),
        }
        for m in modules
    ]
    return JsonResponse({"ok": True, "apps": ["server", "web", "mobile"], "modules": items})


@require_GET
def history(request, module_id=None):
    """
    GET /api/history          — full temporal index
    GET /api/history/<id>     — history for a single module
    """
    if module_id:
        commits = get_module_history(
            module_id, settings.PARTWEAVE_REPO_ROOT
        )
        return JsonResponse({"ok": True, "module": module_id, "history": commits})

    index = build_temporal_index()
    return JsonResponse({"ok": True, **index})


@require_GET
def mock_ui(request):
    """GET / — serve the mock frontend."""
    has_jev = bool(settings.TYPESAFE_API_KEY)
    return render(request, "mock_ui.html", {"has_jev": has_jev})
