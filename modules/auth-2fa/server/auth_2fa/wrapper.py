import time
from collections.abc import Callable
from collections.abc import Set as AbstractSet

from .core import TwoFactorDecision, consume_backup_code, verify_totp_window_step


class TwoFactorFailedError(Exception):
    """Raised when both TOTP and backup-code verification fail."""


class TwoFactorVerifier:
    """Pure Transform + State-Machine Wrapper for 2FA verification."""

    def __init__(
        self,
        *,
        clock: Callable[[], int] | None = None,
        last_used_step: int | None = None,
    ) -> None:
        self.clock = clock or (lambda: int(time.time()))
        self.last_used_step = last_used_step

    def verify(
        self,
        *,
        secret_bytes: bytes,
        backup_codes: AbstractSet[str],
        submitted: str,
    ) -> TwoFactorDecision:
        matched_step = verify_totp_window_step(
            secret_bytes,
            submitted,
            self.clock(),
            last_used_step=self.last_used_step,
        )
        if matched_step is not None:
            self.last_used_step = matched_step
            return TwoFactorDecision(True, frozenset(backup_codes), "totp-verified")
        backup = consume_backup_code(backup_codes, submitted)
        if not backup.ok:
            raise TwoFactorFailedError(backup.reason)
        return backup
