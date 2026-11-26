import time
from collections.abc import Callable
from collections.abc import Set as AbstractSet

from .core import TwoFactorDecision, consume_backup_code, verify_totp_window


class TwoFactorFailedError(Exception):
    """Raised when both TOTP and backup-code verification fail."""


class TwoFactorVerifier:
    """Pure Transform + State-Machine Wrapper for 2FA verification."""

    def __init__(self, *, clock: Callable[[], int] | None = None) -> None:
        self.clock = clock or (lambda: int(time.time()))

    def verify(
        self,
        *,
        secret_bytes: bytes,
        backup_codes: AbstractSet[str],
        submitted: str,
    ) -> TwoFactorDecision:
        if verify_totp_window(secret_bytes, submitted, self.clock()):
            return TwoFactorDecision(True, frozenset(backup_codes), "totp-verified")
        backup = consume_backup_code(backup_codes, submitted)
        if not backup.ok:
            raise TwoFactorFailedError(backup.reason)
        return backup
