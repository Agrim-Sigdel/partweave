import pytest

from reservations import ReservationConflictError, ReservationCoordinator


def test_slot_overlap_and_stock_conservation() -> None:
    coord = ReservationCoordinator(initial_available=5)
    coord.book_slot(10, 20)
    coord.book_slot(20, 30)  # touching endpoints do not overlap
    with pytest.raises(ReservationConflictError):
        coord.book_slot(15, 25)

    st = coord.allocate_stock(3)
    assert (st.available, st.reserved) == (2, 3)
    with pytest.raises(ReservationConflictError):
        coord.allocate_stock(3)
    assert coord.stock.available + coord.stock.reserved == 5
