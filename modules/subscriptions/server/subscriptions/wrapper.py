from collections.abc import Callable
from contextlib import AbstractContextManager, nullcontext
from typing import Any

from .core import decide_subscription_transition, prorate_cents


class InvalidSubscriptionTransition(Exception):
    """Raised when a subscription lifecycle transition is illegal."""


class SubscriptionManager:
    """State-Machine Wrapper: manages subscription status changes & proration."""

    def __init__(
        self,
        *,
        load_status: Callable[[Any], str] | None = None,
        save_status: Callable[[Any, str], None] | None = None,
        atomic_ctx: Callable[[], AbstractContextManager[Any]] | None = None,
    ) -> None:
        self.load_status = load_status or (lambda s: s.status)
        self.save_status = save_status or (lambda s, st: setattr(s, "status", st))
        self.atomic_ctx = atomic_ctx or nullcontext

    def transition(self, subscription: Any, event: str) -> Any:
        current = self.load_status(subscription)
        decision = decide_subscription_transition(current, event)
        if not decision.ok or decision.next_status is None:
            raise InvalidSubscriptionTransition(decision.reason or "Illegal transition")
        with self.atomic_ctx():
            self.save_status(subscription, decision.next_status)
        return subscription

    def upgrade_credit_cents(
        self, old_price_cents: int, new_price_cents: int, remaining_days: int, total_days: int
    ) -> int:
        unused = prorate_cents(old_price_cents, remaining_days, total_days)
        charge = prorate_cents(new_price_cents, remaining_days, total_days)
        return charge - unused
