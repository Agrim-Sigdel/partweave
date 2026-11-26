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
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET, require_http_methods

from .indexer import build_temporal_index, get_module_history
from .jev_client import classify_with_jev
from .mock import classify_with_keywords

logger = logging.getLogger(__name__)

_MODULE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
_MAX_CLASSIFY_BODY_BYTES = 16 * 1024
_MAX_DESCRIPTION_CHARS = 4000


def _is_allowed_origin(request) -> bool:
    """Reject cross-origin browser requests not matching Host or CORS_ALLOWED_ORIGINS."""
    origin = request.META.get("HTTP_ORIGIN")
    if not origin:
        return True
    if origin in getattr(settings, "CORS_ALLOWED_ORIGINS", []):
        return True
    parsed = urlparse(origin)
    host = request.get_host()
    return bool(parsed.netloc and parsed.netloc == host)


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
            mid = manifest.get("id", "")
            if not isinstance(mid, str) or not _MODULE_ID_RE.match(mid):
                logger.warning("Skipping manifest with invalid id: %s", manifest_path)
                continue
            catalog.append(manifest)
        except (json.JSONDecodeError, OSError):
            logger.warning("Skipping unreadable manifest: %s", manifest_path)

    return catalog


@require_http_methods(["POST"])
def classify(request):
    """
    POST /api/classify

    Body: {"description": "I'm building a SaaS app with..."}
    """
    if not _is_allowed_origin(request):
        return JsonResponse({"ok": False, "error": "Origin not allowed"}, status=403)

    if request.content_type != "application/json":
        return JsonResponse(
            {"ok": False, "error": "Content-Type must be application/json"}, status=415
        )

    if len(request.body) > _MAX_CLASSIFY_BODY_BYTES:
        return JsonResponse(
            {"ok": False, "error": "Request body too large"}, status=413
        )

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse(
            {"ok": False, "error": "Invalid JSON body"}, status=400
        )

    if not isinstance(body, dict):
        return JsonResponse(
            {"ok": False, "error": "JSON body must be an object"}, status=400
        )

    raw_desc = body.get("description", "")
    if not isinstance(raw_desc, str):
        return JsonResponse(
            {"ok": False, "error": "'description' must be a string"}, status=400
        )
    description = raw_desc.strip()
    if not description:
        return JsonResponse(
            {"ok": False, "error": "Missing 'description' field"}, status=400
        )
    if len(description) > _MAX_DESCRIPTION_CHARS:
        return JsonResponse(
            {"ok": False, "error": f"Description exceeds {_MAX_DESCRIPTION_CHARS} characters"},
            status=400,
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
        if not _MODULE_ID_RE.match(module_id):
            return JsonResponse({"ok": False, "error": "Invalid module id"}, status=400)
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
