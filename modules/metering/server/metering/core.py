from dataclasses import dataclass


@dataclass(frozen=True)
class UsageResult:
    new_used: int
    remaining: int
    overage: int


def apply_usage(quota: int, used: int, delta: int) -> UsageResult:
    if quota < 0 or used < 0 or delta < 0:
        raise ValueError("Usage inputs must be non-negative")
    new_used = used + delta
    remaining = max(0, quota - new_used)
    overage = max(0, new_used - quota)
    return UsageResult(new_used=new_used, remaining=remaining, overage=overage)
