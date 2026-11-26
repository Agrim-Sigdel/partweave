from dataclasses import dataclass


@dataclass(frozen=True)
class BucketDecision:
    allowed: bool
    remaining: int
    retry_after_sec: int


def consume_tokens(
    tokens: int,
    capacity: int,
    elapsed_sec: int,
    refill_per_sec: int,
    cost: int = 1,
) -> BucketDecision:
    if tokens < 0 or capacity < 1 or elapsed_sec < 0 or refill_per_sec < 1 or cost < 1:
        raise ValueError("Invalid token bucket parameters")
    refilled = min(capacity, tokens + elapsed_sec * refill_per_sec)
    if refilled >= cost:
        return BucketDecision(True, refilled - cost, 0)
    deficit = cost - refilled
    retry_after = (deficit + refill_per_sec - 1) // refill_per_sec
    return BucketDecision(False, refilled, retry_after)
