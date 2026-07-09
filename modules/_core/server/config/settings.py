"""
Django settings for {{projectName}}.

Feature modules extend this file only at the `# <partweave:...>` anchors below, so
the base scaffold stays clean and re-generation is deterministic.
"""
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(DJANGO_DEBUG=(bool, False))
# Load env from the server dir first, then the monorepo root (if present).
environ.Env.read_env(BASE_DIR / ".env")
environ.Env.read_env(BASE_DIR.parent.parent / ".env")

# DEBUG defaults to False so a forgotten env var fails *closed* — a production
# deploy that never set DJANGO_DEBUG serves safe error pages, not debug 500s that
# would dump SECRET_KEY and the DB DSN. The generated dev .env sets DJANGO_DEBUG=true.
DEBUG = env.bool("DJANGO_DEBUG", default=False)

# SECRET_KEY signs sessions and (with the `auth` component) JWTs. The scaffolder
# writes a unique, random key into this project's .env at creation time, so no
# two projects — and nothing public — ever share a signing key. There is
# deliberately no shared production default: outside DEBUG a missing key raises
# ImproperlyConfigured rather than falling back to a globally-known value an
# attacker could use to forge tokens.
if DEBUG:
    SECRET_KEY = env(
        "DJANGO_SECRET_KEY",
        default="django-insecure-dev-only-do-not-use-in-production",
    )
else:
    SECRET_KEY = env("DJANGO_SECRET_KEY")
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
    # <partweave:installed-apps>
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
        # <partweave:drf-auth>
    ],
    # Secure by default: every DRF view requires authentication unless it opts out
    # locally (e.g. auth's register/login set AllowAny; the schema/docs below do
    # too). A new endpoint is private until you deliberately open it.
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}

SPECTACULAR_SETTINGS = {
    "TITLE": "{{projectName}} API",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# Allow all origins in DEBUG so local web/mobile clients can call the API. In
# production (DEBUG off) list the exact web origins allowed, via the environment.
CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOWED_ORIGINS = env.list("DJANGO_CORS_ALLOWED_ORIGINS", default=[])

# <partweave:settings>
