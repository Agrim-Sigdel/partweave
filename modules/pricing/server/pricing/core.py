from dataclasses import dataclass


@dataclass(frozen=True)
class LineItem:
    unit_cents: int
    quantity: int


@dataclass(frozen=True)
class PriceBreakdown:
    subtotal_cents: int
    discount_cents: int
    tax_cents: int
    total_cents: int


def compute_price(
    subtotal_cents: int,
    *,
    pct_off: int = 0,
    flat_off_cents: int = 0,
    tax_bps: int = 0,
) -> PriceBreakdown:
    if (
        subtotal_cents < 0
        or not (0 <= pct_off <= 100)
        or flat_off_cents < 0
        or not (0 <= tax_bps <= 10_000)
    ):
        raise ValueError("Invalid pricing inputs")
    raw_discount = (subtotal_cents * pct_off) // 100 + flat_off_cents
    discount = min(subtotal_cents, raw_discount)
    taxable = subtotal_cents - discount
    tax = (taxable * tax_bps) // 10_000
    return PriceBreakdown(
        subtotal_cents=subtotal_cents,
        discount_cents=discount,
        tax_cents=tax,
        total_cents=taxable + tax,
    )
