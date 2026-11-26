export interface TimeSlot {
  readonly start: number;
  readonly end: number;
}

export interface ReservationResult {
  readonly available: number;
  readonly reserved: number;
}

export function timeSlotsOverlap(a: TimeSlot, b: TimeSlot): boolean {
  if (a.start >= a.end || b.start >= b.end) throw new Error("TimeSlot requires start < end");
  return a.start < b.end && b.start < a.end;
}

export function reserveInventoryStock(
  available: number,
  reserved: number,
  qty: number,
): ReservationResult {
  if (available < 0 || reserved < 0 || qty < 1) throw new Error("Invalid stock parameters");
  if (available < qty) throw new Error("Insufficient stock");
  return { available: available - qty, reserved: reserved + qty };
}
