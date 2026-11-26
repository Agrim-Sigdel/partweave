from collections.abc import Callable, Sequence
from contextlib import AbstractContextManager, nullcontext

from .core import LedgerLine, validate_journal_entry


class UnbalancedEntryError(Exception):
    """Raised when debits do not equal credits."""


class LedgerPoster:
    """Counter / Quota Wrapper: commits verified zero-sum journal entries atomically."""

    def __init__(
        self,
        *,
        load_balance: Callable[[str], int],
        save_balance: Callable[[str, int], None],
        append_journal: Callable[[Sequence[LedgerLine]], None] | None = None,
        atomic_ctx: Callable[[], AbstractContextManager[None]] | None = None,
    ) -> None:
        self.load_balance = load_balance
        self.save_balance = save_balance
        self.append_journal = append_journal
        self.atomic_ctx = atomic_ctx or nullcontext

    def post(self, lines: Sequence[LedgerLine], *, allow_negative: bool = False) -> None:
        try:
            validate_journal_entry(lines)
        except ValueError as exc:
            raise UnbalancedEntryError(str(exc)) from exc

        with self.atomic_ctx():
            deltas: dict[str, int] = {}
            for line in lines:
                deltas[line.account_id] = deltas.get(line.account_id, 0) + line.amount_cents
            updated: dict[str, int] = {}
            for acct, delta in deltas.items():
                nxt = self.load_balance(acct) + delta
                if not allow_negative and nxt < 0:
                    raise UnbalancedEntryError(f"Account '{acct}' would go negative ({nxt})")
                updated[acct] = nxt
            for acct, nxt in updated.items():
                self.save_balance(acct, nxt)
            if self.append_journal is not None:
                self.append_journal(lines)
