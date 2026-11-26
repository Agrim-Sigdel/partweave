datatype PriceBreakdown = PriceBreakdown(
  subtotalCents: int,
  discountCents: int,
  taxCents: int,
  totalCents: int
)

function ComputePrice(subtotal: int, pctOff: int, flatOff: int, taxBps: int): PriceBreakdown
  requires subtotal >= 0 && 0 <= pctOff <= 100 && flatOff >= 0 && 0 <= taxBps <= 10000
  ensures 0 <= ComputePrice(subtotal, pctOff, flatOff, taxBps).discountCents <= subtotal
  ensures ComputePrice(subtotal, pctOff, flatOff, taxBps).totalCents >= 0
{
  var rawDisc := (subtotal * pctOff) / 100 + flatOff;
  var disc := if rawDisc > subtotal then subtotal else rawDisc;
  var taxable := subtotal - disc;
  var tax := (taxable * taxBps) / 10000;
  PriceBreakdown(subtotal, disc, tax, taxable + tax)
}
