import pytest

from subscriptions import (
    InvalidSubscriptionTransition,
    SubscriptionManager,
    prorate_cents,
)


class _Sub:
    def __init__(self, status: str = "trialing") -> None:
        self.status = status


def test_subscription_lifecycle_and_proration() -> None:
    mgr = SubscriptionManager()
    sub = _Sub()
    mgr.transition(sub, "activate")
    mgr.transition(sub, "payment_failed")
    mgr.transition(sub, "payment_succeeded")
    mgr.transition(sub, "cancel")
    assert sub.status == "canceled"

    with pytest.raises(InvalidSubscriptionTransition):
        mgr.transition(sub, "activate")

    assert 0 <= prorate_cents(3000, 15, 30) <= 3000
    assert mgr.upgrade_credit_cents(1000, 3000, 15, 30) == 1000
