import time
from collections.abc import Callable

from .core import ApiKeyDecision, ApiKeyRecord, validate_api_key


class ApiKeyAuthError(Exception):
    """Raised when an API key is missing, revoked, or expired (401)."""


class ApiKeyScopeError(Exception):
    """Raised when a valid API key lacks the required scope (403)."""


class ApiKeyGuard:
    """Policy / Guard Wrapper: binds verified key checks to a clock & key lookup."""

    def __init__(
        self,
        lookup_key: Callable[[str], ApiKeyRecord | None],
        *,
        expected_prefix: str = "pw_live_",
        clock: Callable[[], int] | None = None,
    ) -> None:
        self.lookup_key = lookup_key
        self.expected_prefix = expected_prefix
        self.clock = clock or (lambda: int(time.time()))

    def enforce(self, raw_token: str, required_scope: str) -> ApiKeyDecision:
        if not raw_token.startswith(self.expected_prefix):
            raise ApiKeyAuthError("Invalid API key prefix")
        record = self.lookup_key(raw_token)
        if record is None:
            raise ApiKeyAuthError("Unknown API key")
        decision = validate_api_key(record, self.expected_prefix, self.clock(), required_scope)
        if not decision.allowed:
            if decision.status_code == 401:
                raise ApiKeyAuthError(decision.reason)
            raise ApiKeyScopeError(decision.reason)
        return decision
