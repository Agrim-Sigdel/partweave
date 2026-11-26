from audit_log import AuditRecorder, compute_diff, scrub_payload


def test_audit_scrubber_and_diff() -> None:
    events = []
    recorder = AuditRecorder(events.append)
    ev = recorder.record(
        actor_id="u1",
        action="update",
        resource="user:1",
        payload={"email": "a@b.com", "password": "secret", "nested": [{"api_key": "k"}]},
        before={"role": "viewer", "password": "old"},
        after={"role": "editor", "password": "new"},
    )
    assert ev.payload["password"] == "[REDACTED]"
    assert ev.payload["nested"][0]["api_key"] == "[REDACTED]"
    assert ev.diff == {"role": {"before": "viewer", "after": "editor"}}
    assert compute_diff({"a": 1}, {"a": 1}) == {}
    assert scrub_payload({"token": "x"})["token"] == "[REDACTED]"
    scrubbed = scrub_payload(
        {"access_token": "jwt", "client_secret": "s", "nested": ({"x_api_key": "k"},)}
    )
    assert scrubbed["access_token"] == "[REDACTED]"
    assert scrubbed["client_secret"] == "[REDACTED]"
    assert scrubbed["nested"][0]["x_api_key"] == "[REDACTED]"

    deep: dict = {}
    cur = deep
    for _ in range(40):
        cur["next"] = {}
        cur = cur["next"]
    assert isinstance(scrub_payload(deep), dict)
