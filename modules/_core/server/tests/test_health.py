def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_api_docs_are_public(client):
    # The global default is IsAuthenticated (F20); the schema + docs opt out so
    # they stay browsable without a token. Guards that carve-out.
    assert client.get("/api/schema/").status_code == 200
    assert client.get("/api/docs/").status_code == 200
