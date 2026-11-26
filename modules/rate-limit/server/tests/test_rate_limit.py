import pytest

from rate_limit import RateLimiter, RateLimitExceededError, consume_tokens


def test_rate_limiter_bounds_and_refill() -> None:
    now = [100]
    limiter = RateLimiter(capacity=2, refill_per_sec=1, clock=lambda: now[0])
    assert limiter.enforce("ip:1").remaining == 1
    assert limiter.enforce("ip:1").remaining == 0

    with pytest.raises(RateLimitExceededError) as exc:
        limiter.enforce("ip:1")
    assert exc.value.retry_after_sec == 1

    now[0] = 102
    assert limiter.enforce("ip:1").allowed
    assert consume_tokens(0, 5, 10, 2, 1).remaining == 4
