import pytest

from api_keys import ApiKeyAuthError, ApiKeyGuard, ApiKeyRecord, ApiKeyScopeError


def test_api_key_lifecycle_and_scopes() -> None:
    store = {
        "pw_live_ok": ApiKeyRecord("pw_live_", False, 2000, frozenset({"read"})),
        "pw_live_revoked": ApiKeyRecord("pw_live_", True, 2000, frozenset({"read"})),
        "pw_live_expired": ApiKeyRecord("pw_live_", False, 900, frozenset({"read"})),
    }
    guard = ApiKeyGuard(store.get, clock=lambda: 1000)

    assert guard.enforce("pw_live_ok", "read").allowed
    with pytest.raises(ApiKeyScopeError):
        guard.enforce("pw_live_ok", "write")
    with pytest.raises(ApiKeyAuthError):
        guard.enforce("pw_live_revoked", "read")
    with pytest.raises(ApiKeyAuthError):
        guard.enforce("pw_live_expired", "read")
