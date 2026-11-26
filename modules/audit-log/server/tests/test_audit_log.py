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
