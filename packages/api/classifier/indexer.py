"""
Temporal code indexer — reads git history for the modules/ directory.

Builds a per-module timeline of commits so Jev can factor module maturity
(more commits + longer history = more stable/battle-tested) into its
classification decisions. Uses tag-to-tag diffs when tags exist, falls
back to raw commit history otherwise.
"""

from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path
from typing import Any

from django.conf import settings

logger = logging.getLogger(__name__)


def _run_git(args: list[str], cwd: str) -> str:
    """Run a git command and return stdout. Returns empty string on failure."""
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=30,
        )
        return result.stdout.strip() if result.returncode == 0 else ""
    except (FileNotFoundError, subprocess.TimeoutExpired):
        logger.warning("git command failed: git %s", " ".join(args))
        return ""


def get_release_tags(repo_root: str) -> list[dict[str, str]]:
    """
    List version tags (v*) sorted by date, newest first.

    Returns [{"tag": "v0.5.0", "date": "2026-09-15", "commit": "abc1234"}, ...]
    """
    raw = _run_git(
        [
            "tag", "-l", "v*",
            "--sort=-creatordate",
            "--format=%(refname:short)|%(creatordate:short)|%(objectname:short)",
        ],
        cwd=repo_root,
    )
    if not raw:
        return []

    tags = []
    for line in raw.splitlines():
        parts = line.split("|")
        if len(parts) >= 3:
            tags.append({"tag": parts[0], "date": parts[1], "commit": parts[2]})
    return tags


def get_module_history(
    module_id: str,
    repo_root: str,
    max_commits: int = 20,
) -> list[dict[str, str]]:
    """
    Get recent commits touching a specific module's directory.

    Returns [{"hash": "abc1234", "date": "2026-09-15", "subject": "feat: ..."}, ...]
    """
    module_path = f"modules/{module_id}"
    raw = _run_git(
        [
            "log",
            f"--max-count={max_commits}",
            "--format=%h|%as|%s",
            "--",
            module_path,
        ],
        cwd=repo_root,
    )
    if not raw:
        return []

    commits = []
    for line in raw.splitlines():
        parts = line.split("|", 2)
        if len(parts) >= 3:
            commits.append({
                "hash": parts[0],
                "date": parts[1],
                "subject": parts[2],
            })
    return commits


def build_temporal_index(
    modules_dir: str | None = None,
    repo_root: str | None = None,
) -> dict[str, Any]:
    """
    Build a temporal index of all modules.

    Returns:
    {
        "tags": [...],
        "modules": {
            "auth": {
                "current": { ...module.json... },
                "history": [{"hash": ..., "date": ..., "subject": ...}, ...],
                "commit_count": 12,
                "first_seen": "2026-06-01",
                "last_modified": "2026-09-15",
            },
            ...
        }
    }
    """
    modules_dir = modules_dir or settings.PARTWEAVE_MODULES_DIR
    repo_root = repo_root or settings.PARTWEAVE_REPO_ROOT
    modules_path = Path(modules_dir)

    index: dict[str, Any] = {
        "tags": get_release_tags(repo_root),
        "modules": {},
    }

    if not modules_path.is_dir():
        logger.warning("Modules directory not found: %s", modules_dir)
        return index

    for child in sorted(modules_path.iterdir()):
        if not child.is_dir() or child.name.startswith((".", "_")):
            continue

        manifest_path = child / "module.json"
        if not manifest_path.exists():
            continue

        try:
            manifest = json.loads(manifest_path.read_text())
        except (json.JSONDecodeError, OSError):
            logger.warning("Failed to read manifest: %s", manifest_path)
            continue

        history = get_module_history(child.name, repo_root)

        index["modules"][child.name] = {
            "current": manifest,
            "history": history,
            "commit_count": len(history),
            "first_seen": history[-1]["date"] if history else None,
            "last_modified": history[0]["date"] if history else None,
        }

    return index
