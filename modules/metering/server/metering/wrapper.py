from collections.abc import Callable
from contextlib import AbstractContextManager, nullcontext

from .core import UsageResult, apply_usage


class QuotaExceededError(Exception):
    """Raised when hard-cap metering rejects overage usage."""


class MeteringTracker:
    """Counter / Quota Wrapper: commits verified usage conservation updates."""

    def __init__(
        self,
        *,
        load_used: Callable[[str], int],
        save_used: Callable[[str, int], None],
        hard_cap: bool = False,
        atomic_ctx: Callable[[], AbstractContextManager[None]] | None = None,
    ) -> None:
        self.load_used = load_used
        self.save_used = save_used
        self.hard_cap = hard_cap
        self.atomic_ctx = atomic_ctx or nullcontext

    def record(self, key: str, *, quota: int, delta: int) -> UsageResult:
        with self.atomic_ctx():
            used = self.load_used(key)
            res = apply_usage(quota, used, delta)
            if self.hard_cap and res.overage > 0:
                raise QuotaExceededError(f"Quota exceeded by {res.overage}")
            self.save_used(key, res.new_used)
            return res
