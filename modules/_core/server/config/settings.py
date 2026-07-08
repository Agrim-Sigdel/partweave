"""
Django settings for {{projectName}}.

Feature modules extend this file only at the `# <quick-build:...>` anchors below, so
the base scaffold stays clean and re-generation is deterministic.
"""
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(DJANGO_DEBUG=(bool, True))
# Load env from the server dir first, then the monorepo root (if present).
environ.Env.read_env(BASE_DIR / ".env")
environ.Env.read_env(BASE_DIR.parent.parent / ".env")

# Dev-only default; override with DJANGO_SECRET_KEY in production. Kept ≥32 bytes
# so JWT's HS256 signing doesn't warn about a short HMAC key (RFC 7518 §3.2).
SECRET_KEY = env("DJANGO_SECRET_KEY", default="django-insecure-dev-key-change-me-in-production")
DEBUG = env.bool("DJANGO_DEBUG", default=True)
# In DEBUG, allow any host so a phone/simulator can reach the dev server over the
# LAN. In production set DJANGO_DEBUG=false and provide DJANGO_ALLOWED_HOSTS.
ALLOWED_HOSTS = env.list(
    "DJANGO_ALLOWED_HOSTS",
    default=["*"] if DEBUG else ["localhost", "127.0.0.1"],
)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "drf_spectacular",
    "corsheaders",
    # <quick-build:installed-apps>
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Defaults to SQLite so the server boots with zero infra. The `db-postgres`
# component sets DATABASE_URL to a Postgres DSN (and adds the driver).
DATABASES = {
    "default": env.db(
        "DATABASE_URL", default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}"
    ),
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": [
        # <quick-build:drf-auth>
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
}

SPECTACULAR_SETTINGS = {
    "TITLE": "{{projectName}} API",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# Allow all origins in DEBUG so local web/mobile clients can call the API.
CORS_ALLOW_ALL_ORIGINS = DEBUG

# <quick-build:settings>
