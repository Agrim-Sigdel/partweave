from dataclasses import dataclass

SUBSCRIPTION_TRANSITIONS: dict[str, dict[str, str]] = {
    "trialing": {"activate": "active", "cancel": "canceled"},
    "active": {"payment_failed": "past_due", "cancel": "canceled"},
    "past_due": {"payment_succeeded": "active", "cancel": "canceled"},
    "canceled": {},
}


@dataclass(frozen=True)
class SubscriptionDecision:
    ok: bool
    next_status: str | None = None
    reason: str | None = None


def decide_subscription_transition(current: str, event: str) -> SubscriptionDecision:
    if current == "canceled":
        return SubscriptionDecision(False, reason="Canceled subscription cannot transition")
    nxt = SUBSCRIPTION_TRANSITIONS.get(current, {}).get(event)
    if nxt is None:
        return SubscriptionDecision(False, reason=f"Illegal transition '{event}' from '{current}'")
    return SubscriptionDecision(True, next_status=nxt)


def prorate_cents(price_cents: int, remaining_days: int, total_days: int) -> int:
    if price_cents < 0 or total_days < 1 or not (0 <= remaining_days <= total_days):
        raise ValueError("Invalid proration arguments")
    return (price_cents * remaining_days) // total_days
