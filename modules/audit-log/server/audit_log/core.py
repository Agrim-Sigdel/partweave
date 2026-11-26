from collections.abc import Mapping
from collections.abc import Set as AbstractSet
from typing import Any

DEFAULT_SENSITIVE_KEYS: frozenset[str] = frozenset(
    {
        "password",
        "passwd",
        "token",
        "access_token",
        "refresh_token",
        "secret",
        "secret_key",
        "client_secret",
        "private_key",
        "api_key",
        "apikey",
        "x-api-key",
        "authorization",
        "cookie",
        "set-cookie",
        "session_id",
        "credential",
        "database_url",
        "dsn",
        "refresh",
    }
)

_SENSITIVE_SUBSTRINGS = (
    "password",
    "passwd",
    "secret",
    "token",
    "api_key",
    "apikey",
    "authorization",
    "cookie",
    "credential",
    "private_key",
)


def _is_sensitive_key(key: Any, sensitive_keys: AbstractSet[str]) -> bool:
    lowered = str(key).lower()
    if lowered in sensitive_keys:
        return True
    if sensitive_keys is DEFAULT_SENSITIVE_KEYS:
        return any(sub in lowered for sub in _SENSITIVE_SUBSTRINGS)
    return False


def scrub_payload(
    value: Any,
    sensitive_keys: AbstractSet[str] = DEFAULT_SENSITIVE_KEYS,
    *,
    _depth: int = 0,
    _max_depth: int = 32,
) -> Any:
    if _depth > _max_depth:
        return "[MAX_DEPTH]"
    if isinstance(value, Mapping):
        return {
            k: (
                "[REDACTED]"
                if _is_sensitive_key(k, sensitive_keys)
                else scrub_payload(v, sensitive_keys, _depth=_depth + 1, _max_depth=_max_depth)
            )
            for k, v in value.items()
        }
    if isinstance(value, (list, tuple, set, frozenset)):
        return [
            scrub_payload(item, sensitive_keys, _depth=_depth + 1, _max_depth=_max_depth)
            for item in value
        ]
    return value


def compute_diff(
    before: Mapping[str, Any],
    after: Mapping[str, Any],
    sensitive_keys: AbstractSet[str] = DEFAULT_SENSITIVE_KEYS,
) -> dict[str, dict[str, Any]]:
    clean_before = scrub_payload(before, sensitive_keys)
    clean_after = scrub_payload(after, sensitive_keys)
    keys = sorted(set(clean_before.keys()) | set(clean_after.keys()))
    diff: dict[str, dict[str, Any]] = {}
    for k in keys:
        old_val = clean_before.get(k)
        new_val = clean_after.get(k)
        if k not in clean_before or k not in clean_after or old_val != new_val:
            diff[k] = {"before": old_val, "after": new_val}
    return diff
