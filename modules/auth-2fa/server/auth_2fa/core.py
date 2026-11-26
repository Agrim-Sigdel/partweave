import hashlib
import hmac
import struct
from collections.abc import Set as AbstractSet
from dataclasses import dataclass


@dataclass(frozen=True)
class TwoFactorDecision:
    ok: bool
    remaining_backup_codes: frozenset[str]
    reason: str


def compute_totp(secret_bytes: bytes, counter: int, digits: int = 6) -> str:
    if counter < 0 or not (6 <= digits <= 8):
        raise ValueError("Invalid TOTP parameters")
    msg = struct.pack(">Q", counter)
    digest = hmac.new(secret_bytes, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code_int = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(code_int % (10**digits)).zfill(digits)


def verify_totp_window_step(
    secret_bytes: bytes,
    submitted_code: str,
    now_epoch: int,
    *,
    period_sec: int = 30,
    drift_steps: int = 1,
    last_used_step: int | None = None,
) -> int | None:
    """Return the matched TOTP time-step or None, rejecting already-used steps."""
    if period_sec < 1 or drift_steps < 0 or now_epoch < 0:
        raise ValueError("Invalid TOTP window parameters")
    base_step = now_epoch // period_sec
    matched_step: int | None = None
    for delta in range(-drift_steps, drift_steps + 1):
        step = base_step + delta
        if step < 0:
            continue
        is_match = hmac.compare_digest(compute_totp(secret_bytes, step), submitted_code)
        if is_match and (last_used_step is None or step > last_used_step):
            matched_step = step
    return matched_step


def verify_totp_window(
    secret_bytes: bytes,
    submitted_code: str,
    now_epoch: int,
    *,
    period_sec: int = 30,
    drift_steps: int = 1,
    last_used_step: int | None = None,
) -> bool:
    return (
        verify_totp_window_step(
            secret_bytes,
            submitted_code,
            now_epoch,
            period_sec=period_sec,
            drift_steps=drift_steps,
            last_used_step=last_used_step,
        )
        is not None
    )


def consume_backup_code(
    backup_codes: AbstractSet[str],
    submitted: str,
) -> TwoFactorDecision:
    matched: str | None = None
    for code in backup_codes:
        if hmac.compare_digest(code, submitted):
            matched = code
    if matched is not None:
        remaining = frozenset(c for c in backup_codes if c != matched)
        return TwoFactorDecision(True, remaining, "backup-code-consumed")
    return TwoFactorDecision(False, frozenset(backup_codes), "Invalid backup code")
