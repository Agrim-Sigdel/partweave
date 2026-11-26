from collections.abc import Mapping
from collections.abc import Set as AbstractSet
from typing import Any

DEFAULT_SENSITIVE_KEYS: frozenset[str] = frozenset(
    {"password", "passwd", "token", "secret", "api_key", "authorization", "refresh"}
)


def scrub_payload(
    value: Any,
    sensitive_keys: AbstractSet[str] = DEFAULT_SENSITIVE_KEYS,
) -> Any:
    if isinstance(value, Mapping):
        return {
            k: (
                "[REDACTED]"
                if str(k).lower() in sensitive_keys
                else scrub_payload(v, sensitive_keys)
            )
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [scrub_payload(item, sensitive_keys) for item in value]
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
