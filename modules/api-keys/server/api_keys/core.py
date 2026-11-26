from collections.abc import Set as AbstractSet
from dataclasses import dataclass


@dataclass(frozen=True)
class ApiKeyRecord:
    key_prefix: str
    revoked: bool
    expires_at_epoch: int
    scopes: AbstractSet[str]


@dataclass(frozen=True)
class ApiKeyDecision:
    allowed: bool
    status_code: int
    reason: str


def validate_api_key(
    record: ApiKeyRecord,
    expected_prefix: str,
    now_epoch: int,
    required_scope: str,
) -> ApiKeyDecision:
    if record.key_prefix != expected_prefix:
        return ApiKeyDecision(False, 401, "Invalid API key prefix")
    if record.revoked:
        return ApiKeyDecision(False, 401, "API key revoked")
    if record.expires_at_epoch <= now_epoch:
        return ApiKeyDecision(False, 401, "API key expired")
    if required_scope not in record.scopes:
        return ApiKeyDecision(False, 403, f"Missing API key scope '{required_scope}'")
    return ApiKeyDecision(True, 200, "granted")
