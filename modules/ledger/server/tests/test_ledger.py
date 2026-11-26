import pytest

from ledger import LedgerLine, LedgerPoster, UnbalancedEntryError


def test_double_entry_conservation() -> None:
    balances = {"cash": 1000, "revenue": 0}
    poster = LedgerPoster(
        load_balance=lambda a: balances.get(a, 0),
        save_balance=lambda a, v: balances.__setitem__(a, v),
    )
    poster.post(
        [LedgerLine("cash", 500), LedgerLine("revenue", -500)],
        allow_negative=True,
    )
    assert balances == {"cash": 1500, "revenue": -500}
    assert sum(balances.values()) == 1000

    with pytest.raises(UnbalancedEntryError):
        poster.post([LedgerLine("cash", 100), LedgerLine("revenue", -99)])
