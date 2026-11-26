import time
from collections.abc import Callable

from .core import BucketDecision, consume_tokens


class RateLimitExceededError(Exception):
    """Raised when a bucket rejects a request (HTTP 429)."""

    def __init__(self, retry_after_sec: int) -> None:
        super().__init__(f"Rate limit exceeded; retry after {retry_after_sec}s")
        self.retry_after_sec = retry_after_sec


class RateLimiter:
    """Counter / Quota Wrapper: wraps token-bucket math around any key/value store."""

    def __init__(
        self,
        *,
        capacity: int = 60,
        refill_per_sec: int = 1,
        clock: Callable[[], int] | None = None,
    ) -> None:
        self.capacity = capacity
        self.refill_per_sec = refill_per_sec
        self.clock = clock or (lambda: int(time.time()))
        self._buckets: dict[str, tuple[int, int]] = {}

    def check(self, key: str, *, cost: int = 1) -> BucketDecision:
        now = self.clock()
        tokens, last_ts = self._buckets.get(key, (self.capacity, now))
        elapsed = max(0, now - last_ts)
        decision = consume_tokens(tokens, self.capacity, elapsed, self.refill_per_sec, cost)
        self._buckets[key] = (decision.remaining, now)
        return decision

    def enforce(self, key: str, *, cost: int = 1) -> BucketDecision:
        decision = self.check(key, cost=cost)
        if not decision.allowed:
            raise RateLimitExceededError(decision.retry_after_sec)
        return decision
