import pytest

from metering import MeteringTracker, QuotaExceededError, apply_usage


def test_metering_conservation_and_hard_cap() -> None:
    store = {"tenant:1": 80}
    tracker = MeteringTracker(
        load_used=lambda k: store.get(k, 0),
        save_used=lambda k, v: store.__setitem__(k, v),
        hard_cap=True,
    )
    res = tracker.record("tenant:1", quota=100, delta=20)
    assert (res.new_used, res.remaining, res.overage) == (100, 0, 0)

    with pytest.raises(QuotaExceededError):
        tracker.record("tenant:1", quota=100, delta=1)
    assert store["tenant:1"] == 100

    soft = apply_usage(100, 90, 25)
    assert soft.new_used - soft.overage + soft.remaining == 100
