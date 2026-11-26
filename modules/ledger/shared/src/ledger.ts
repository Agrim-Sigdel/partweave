export interface LedgerLine {
  readonly accountId: string;
  readonly amountCents: number;
}

export interface LedgerPostingResult {
  readonly balanced: boolean;
  readonly netCents: number;
}

export function checkLedgerBalance(lines: readonly LedgerLine[]): LedgerPostingResult {
  if (lines.length === 0) return { balanced: false, netCents: 0 };
  const netCents = lines.reduce((acc, line) => acc + line.amountCents, 0);
  return { balanced: netCents === 0, netCents };
}
