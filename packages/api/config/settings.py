"""
Django settings for partweave API backend.

Minimal config for the Jev-powered classification service. Reads
TYPESAFE_API_KEY from env for the real Jev client; falls back to
keyword-based classification when the key is absent.
"""

import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

DEBUG = os.environ.get("DJANGO_DEBUG", "False").lower() in ("true", "1", "yes")

if DEBUG:
    SECRET_KEY = os.environ.get(
        "DJANGO_SECRET_KEY",
        "django-insecure-partweave-dev-only-change-in-production",
    )
else:
    # Stateless local service: require env key or generate an ephemeral per-process key
    # rather than falling back to a publicly-known static string.
    SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY") or secrets.token_urlsafe(50)

ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "127.0.0.1,localhost").split(",")
    if h.strip()
]

# ---------------------------------------------------------------------------
# Partweave-specific
# ---------------------------------------------------------------------------
# Absolute path to the modules/ catalog at the repo root.
PARTWEAVE_MODULES_DIR = str(
    Path(__file__).resolve().parent.parent.parent.parent / "modules"
)
# Repo root for git history indexing.
PARTWEAVE_REPO_ROOT = str(
    Path(__file__).resolve().parent.parent.parent.parent
)
# TypeSafe AI API key for Jev. When empty, the keyword fallback is used.
TYPESAFE_API_KEY = os.environ.get("TYPESAFE_API_KEY", "")

# ---------------------------------------------------------------------------
# Application definition
# ---------------------------------------------------------------------------
INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "classifier",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

# Restrict CORS to explicit local origins by default (never allow all origins).
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "DJANGO_CORS_ALLOWED_ORIGINS",
        "http://127.0.0.1:8000,http://localhost:8000",
    ).split(",")
    if o.strip()
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# SQLite is fine — this service is stateless; the DB is only here because
# Django requires one. No models, no migrations to run.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# DRF — no auth required for this service.
REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "UNAUTHENTICATED_USER": None,
}

STATIC_URL = "static/"
