from collections.abc import Sequence

from .core import LineItem, PriceBreakdown, compute_price


class PriceCalculator:
    """Counter / Quota Wrapper: evaluates cart line items with verified bounds."""

    def calculate_cart(
        self,
        items: Sequence[LineItem],
        *,
        pct_off: int = 0,
        flat_off_cents: int = 0,
        tax_bps: int = 0,
    ) -> PriceBreakdown:
        subtotal = 0
        for item in items:
            if item.unit_cents < 0 or item.quantity < 0:
                raise ValueError("LineItem values must be non-negative")
            subtotal += item.unit_cents * item.quantity
        return compute_price(
            subtotal,
            pct_off=pct_off,
            flat_off_cents=flat_off_cents,
            tax_bps=tax_bps,
        )
