from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class LedgerLine:
    account_id: str
    amount_cents: int  # >0 debit, <0 credit


def validate_journal_entry(lines: Sequence[LedgerLine]) -> int:
    if not lines:
        raise ValueError("Journal entry must have at least one line")
    total = sum(line.amount_cents for line in lines)
    if total != 0:
        raise ValueError(f"Unbalanced journal entry: net={total}")
    return total
