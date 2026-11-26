export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

export interface SubscriptionDecision {
  readonly ok: boolean;
  readonly nextStatus: SubscriptionStatus | null;
  readonly reason: string | null;
}

const TRANSITIONS: Record<SubscriptionStatus, Record<string, SubscriptionStatus>> = {
  trialing: { activate: "active", cancel: "canceled" },
  active: { payment_failed: "past_due", cancel: "canceled" },
  past_due: { payment_succeeded: "active", cancel: "canceled" },
  canceled: {},
};

export function decideSubscriptionTransition(
  current: SubscriptionStatus,
  event: string,
): SubscriptionDecision {
  const nextStatus = TRANSITIONS[current]?.[event];
  if (!nextStatus) {
    return { ok: false, nextStatus: null, reason: `Illegal transition '${event}' from '${current}'` };
  }
  return { ok: true, nextStatus, reason: null };
}

export function prorateCents(priceCents: number, remainingDays: number, totalDays: number): number {
  if (priceCents < 0 || totalDays < 1 || remainingDays < 0 || remainingDays > totalDays) {
    throw new Error("Invalid proration arguments");
  }
  return Math.floor((priceCents * remainingDays) / totalDays);
}
