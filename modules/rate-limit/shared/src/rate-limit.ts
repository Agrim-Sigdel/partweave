export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSec: number;
}

export function consumeRateLimitTokens(
  tokens: number,
  capacity: number,
  elapsedSec: number,
  refillPerSec: number,
  cost = 1,
): RateLimitDecision {
  if (tokens < 0 || capacity < 1 || elapsedSec < 0 || refillPerSec < 1 || cost < 1) {
    throw new Error("Invalid token bucket parameters");
  }
  const refilled = Math.min(capacity, tokens + elapsedSec * refillPerSec);
  if (refilled >= cost) {
    return { allowed: true, remaining: refilled - cost, retryAfterSec: 0 };
  }
  const deficit = cost - refilled;
  return {
    allowed: false,
    remaining: refilled,
    retryAfterSec: Math.ceil(deficit / refillPerSec),
  };
}
