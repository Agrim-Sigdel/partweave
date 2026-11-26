from pricing import LineItem, PriceCalculator, compute_price


def test_pricing_bounds_and_discount_clamp() -> None:
    calc = PriceCalculator()
    res = calc.calculate_cart(
        [LineItem(unit_cents=1500, quantity=2)],
        pct_off=10,
        flat_off_cents=5000,
        tax_bps=800,
    )
    assert res.subtotal_cents == 3000
    assert res.discount_cents == 3000
    assert res.total_cents == 0

    normal = compute_price(10_000, pct_off=20, tax_bps=1000)
    assert (normal.subtotal_cents, normal.discount_cents, normal.tax_cents, normal.total_cents) == (
        10_000,
        2_000,
        800,
        8_800,
    )
