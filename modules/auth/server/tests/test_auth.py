import pytest

CREDS = {"email": "a@b.com", "password": "supersecret"}


@pytest.mark.django_db
def test_register_login_me():
    from django.test import Client

    client = Client()

    r = client.post("/api/auth/register", CREDS, content_type="application/json")
    assert r.status_code == 201, r.content

    r = client.post("/api/auth/token", CREDS, content_type="application/json")
    assert r.status_code == 200, r.content
    access = r.json()["access"]

    r = client.get("/api/auth/me", HTTP_AUTHORIZATION=f"Bearer {access}")
    assert r.status_code == 200
    assert r.json()["email"] == CREDS["email"]

    # unauthenticated request is rejected
    assert client.get("/api/auth/me").status_code == 401


@pytest.mark.django_db
def test_register_ignores_stale_token():
    """A leftover/invalid token in the client must not block registration.

    Regression test: register is public, so authentication must not run on it —
    otherwise a stale Authorization header 401s before AllowAny is checked.
    """
    from django.test import Client

    client = Client()
    creds = {"email": "c@d.com", "password": "supersecret"}
    r = client.post(
        "/api/auth/register",
        creds,
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer this.is.a.stale.garbage.token",
    )
    assert r.status_code == 201, r.content
