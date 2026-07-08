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
