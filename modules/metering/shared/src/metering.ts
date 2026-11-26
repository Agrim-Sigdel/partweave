export interface MeteringResult {
  readonly newUsed: number;
  readonly remaining: number;
  readonly overage: number;
}

export function applyMeteringUsage(
  quota: number,
  used: number,
  delta: number,
): MeteringResult {
  if (quota < 0 || used < 0 || delta < 0) {
    throw new Error("Usage inputs must be non-negative");
  }
  const newUsed = used + delta;
  const remaining = Math.max(0, quota - newUsed);
  const overage = Math.max(0, newUsed - quota);
  return { newUsed, remaining, overage };
}
