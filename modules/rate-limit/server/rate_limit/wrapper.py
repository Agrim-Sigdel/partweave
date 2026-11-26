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
        max_buckets: int = 10_000,
        bucket_ttl_sec: int = 3600,
        clock: Callable[[], int] | None = None,
    ) -> None:
        if max_buckets < 1 or bucket_ttl_sec < 1:
            raise ValueError("Invalid bucket cache limits")
        self.capacity = capacity
        self.refill_per_sec = refill_per_sec
        self.max_buckets = max_buckets
        self.bucket_ttl_sec = bucket_ttl_sec
        self.clock = clock or (lambda: int(time.time()))
        self._buckets: dict[str, tuple[int, int]] = {}

    def _evict_if_needed(self, now: int) -> None:
        if len(self._buckets) < self.max_buckets:
            return
        stale = [k for k, (_, ts) in self._buckets.items() if (now - ts) >= self.bucket_ttl_sec]
        for k in stale:
            del self._buckets[k]
        while len(self._buckets) >= self.max_buckets:
            oldest_key = next(iter(self._buckets))
            del self._buckets[oldest_key]

    def check(self, key: str, *, cost: int = 1) -> BucketDecision:
        now = self.clock()
        if key not in self._buckets:
            self._evict_if_needed(now)
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
