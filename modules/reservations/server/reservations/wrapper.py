from .core import StockState, TimeSlot, has_slot_conflict, reserve_stock


class ReservationConflictError(Exception):
    """Raised on overlapping time slots or insufficient inventory."""


class ReservationCoordinator:
    """Counter / Quota Wrapper: coordinates slot locks & stock conservation."""

    def __init__(self, initial_available: int = 1) -> None:
        self.stock = StockState(available=initial_available, reserved=0)
        self.slots: list[TimeSlot] = []

    def book_slot(self, start: int, end: int) -> TimeSlot:
        candidate = TimeSlot(start=start, end=end)
        if has_slot_conflict(self.slots, candidate):
            raise ReservationConflictError("Requested time slot overlaps an existing booking")
        self.slots.append(candidate)
        return candidate

    def allocate_stock(self, qty: int) -> StockState:
        try:
            self.stock = reserve_stock(self.stock, qty)
        except ValueError as exc:
            raise ReservationConflictError(str(exc)) from exc
        return self.stock
