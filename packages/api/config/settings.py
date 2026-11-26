"""
Django settings for partweave API backend.

Minimal config for the Jev-powered classification service. Reads
TYPESAFE_API_KEY from env for the real Jev client; falls back to
keyword-based classification when the key is absent.
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    "django-insecure-partweave-dev-only-change-in-production",
)

DEBUG = os.environ.get("DJANGO_DEBUG", "True").lower() in ("true", "1", "yes")

ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",")

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

# Allow all origins in dev (the mock UI is served by Django itself, but
# external tools/agents may call the JSON API).
CORS_ALLOW_ALL_ORIGINS = DEBUG

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
