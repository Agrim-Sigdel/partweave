export interface PageWindow {
  readonly start: number;
  readonly endExclusive: number;
  readonly hasMore: boolean;
}

export function clampPageLimit(requested: number, maxLimit = 100): number {
  if (maxLimit < 1) throw new Error("maxLimit must be >= 1");
  if (requested < 1) return 1;
  if (requested > maxLimit) return maxLimit;
  return Math.trunc(requested);
}

export function buildPageWindow(offset: number, limit: number, total: number): PageWindow {
  if (offset < 0 || limit < 1 || total < 0) throw new Error("Invalid pagination bounds");
  const start = Math.min(offset, total);
  const endExclusive = Math.min(start + limit, total);
  return { start, endExclusive, hasMore: endExclusive < total };
}
