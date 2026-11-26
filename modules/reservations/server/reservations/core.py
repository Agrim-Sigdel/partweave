from collections.abc import Iterable
from dataclasses import dataclass


@dataclass(frozen=True)
class TimeSlot:
    start: int
    end: int

    def __post_init__(self) -> None:
        if self.start >= self.end:
            raise ValueError("TimeSlot requires start < end")


@dataclass(frozen=True)
class StockState:
    available: int
    reserved: int


def intervals_overlap(a: TimeSlot, b: TimeSlot) -> bool:
    return a.start < b.end and b.start < a.end


def has_slot_conflict(existing: Iterable[TimeSlot], candidate: TimeSlot) -> bool:
    return any(intervals_overlap(slot, candidate) for slot in existing)


def reserve_stock(state: StockState, qty: int) -> StockState:
    if state.available < 0 or state.reserved < 0 or qty < 1:
        raise ValueError("Invalid stock parameters")
    if state.available < qty:
        raise ValueError("Insufficient stock")
    return StockState(available=state.available - qty, reserved=state.reserved + qty)
