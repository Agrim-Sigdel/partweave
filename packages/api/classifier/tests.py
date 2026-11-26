"""Tests for the keyword-based fallback classifier."""

import os
import sys
import unittest
from pathlib import Path

# Add the api package to the path so Django settings can be found.
API_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(API_DIR))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.conf import settings
from django.test import Client

from classifier.mock import classify_with_keywords


def _fake_catalog():
    """Minimal catalog for testing."""
    return [
        {"id": "auth", "title": "Authentication (JWT)", "description": "Email/password auth with JWT"},
        {"id": "db-postgres", "title": "PostgreSQL database", "description": "PostgreSQL connection"},
        {"id": "storage", "title": "File storage", "description": "File upload with S3/local"},
        {"id": "docker", "title": "Docker", "description": "Containerization"},
        {"id": "ci", "title": "CI/CD", "description": "GitHub Actions CI pipeline"},
        {"id": "rbac", "title": "RBAC", "description": "Role-based access control"},
        {"id": "rate-limit", "title": "Rate limiting", "description": "API rate limiting"},
        {"id": "audit-log", "title": "Audit log", "description": "Audit trail"},
        {"id": "feedback", "title": "Feedback", "description": "User feedback collection"},
        {"id": "workflow-engine", "title": "Workflow engine", "description": "State machine workflows"},
        {"id": "example", "title": "Example", "description": "Example module"},
    ]


class TestKeywordClassifier(unittest.TestCase):
    def test_saas_description_includes_auth(self):
        result = classify_with_keywords(
            "I'm building a SaaS app with user login and file uploads",
            _fake_catalog(),
        )
        self.assertTrue(result.apps["server"])
        self.assertTrue(result.apps["web"])
        self.assertTrue(result.modules["auth"].include)
        self.assertTrue(result.modules["storage"].include)
        self.assertTrue(result.using_fallback)

    def test_mobile_app_description(self):
        result = classify_with_keywords(
            "Building a mobile app for iOS and Android",
            _fake_catalog(),
        )
        self.assertTrue(result.apps["mobile"])

    def test_api_only_description(self):
        result = classify_with_keywords(
            "I need a REST API backend with a database and authentication",
            _fake_catalog(),
        )
        self.assertTrue(result.apps["server"])
        self.assertTrue(result.modules["auth"].include)
        self.assertTrue(result.modules["db-postgres"].include)

    def test_empty_description_defaults_to_fullstack(self):
        result = classify_with_keywords(
            "something generic and vague",
            _fake_catalog(),
        )
        # Should default to server + web when nothing specific matches
        self.assertTrue(result.apps["server"])
        self.assertTrue(result.apps["web"])

    def test_docker_and_ci_from_devops_description(self):
        result = classify_with_keywords(
            "I want containerized deployment with CI/CD pipelines",
            _fake_catalog(),
        )
        self.assertTrue(result.modules["docker"].include)
        self.assertTrue(result.modules["ci"].include)

    def test_auth_auto_includes_postgres(self):
        """When auth is included, db-postgres should be auto-included."""
        result = classify_with_keywords(
            "I need user authentication and login",
            _fake_catalog(),
        )
        self.assertTrue(result.modules["auth"].include)
        self.assertTrue(result.modules["db-postgres"].include)

    def test_to_dict_shape(self):
        result = classify_with_keywords(
            "a SaaS web app with login",
            _fake_catalog(),
        )
        d = result.to_dict()
        self.assertIn("apps", d)
        self.assertIn("modules", d)
        self.assertIn("complexity", d)
        self.assertIn("maturity", d)
        self.assertIn("using_fallback", d)
        # Module entries have include + confidence
        for mid, info in d["modules"].items():
            self.assertIn("include", info)
            self.assertIn("confidence", info)


class TestApiSecurityDefaults(unittest.TestCase):
    def test_safe_defaults(self):
        self.assertFalse(settings.DEBUG)
        self.assertFalse(settings.CORS_ALLOW_ALL_ORIGINS)
        self.assertNotIn("*", settings.ALLOWED_HOSTS)

    def test_classify_enforces_origin_content_type_and_size(self):
        client = Client(HTTP_HOST="127.0.0.1:8000")

        # Non-JSON Content-Type rejected (blocks CORS simple POST requests)
        r = client.post("/api/classify", data='{"description":"auth"}', content_type="text/plain")
        self.assertEqual(r.status_code, 415)

        # Untrusted cross-origin rejected
        r = client.post(
            "/api/classify",
            data='{"description":"auth"}',
            content_type="application/json",
            HTTP_ORIGIN="https://evil.example",
        )
        self.assertEqual(r.status_code, 403)

        # Oversized payload rejected
        r = client.post(
            "/api/classify",
            data='{"description":"' + ("a" * 20000) + '"}',
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 413)

        # Valid same-origin JSON request succeeds
        r = client.post(
            "/api/classify",
            data='{"description":"SaaS app with login"}',
            content_type="application/json",
            HTTP_ORIGIN="http://127.0.0.1:8000",
        )
        self.assertEqual(r.status_code, 200)

    def test_history_rejects_invalid_module_id(self):
        client = Client(HTTP_HOST="127.0.0.1:8000")
        r = client.get("/api/history/..invalid")
        self.assertEqual(r.status_code, 400)


if __name__ == "__main__":
    unittest.main()
