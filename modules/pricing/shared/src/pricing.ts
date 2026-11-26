export interface PricingBreakdown {
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
}

export function computeVerifiedPrice(
  subtotalCents: number,
  pctOff = 0,
  flatOffCents = 0,
  taxBps = 0,
): PricingBreakdown {
  if (
    subtotalCents < 0 ||
    pctOff < 0 ||
    pctOff > 100 ||
    flatOffCents < 0 ||
    taxBps < 0 ||
    taxBps > 10_000
  ) {
    throw new Error("Invalid pricing inputs");
  }
  const discountCents = Math.min(subtotalCents, Math.floor((subtotalCents * pctOff) / 100) + flatOffCents);
  const taxable = subtotalCents - discountCents;
  const taxCents = Math.floor((taxable * taxBps) / 10_000);
  return { subtotalCents, discountCents, taxCents, totalCents: taxable + taxCents };
}
