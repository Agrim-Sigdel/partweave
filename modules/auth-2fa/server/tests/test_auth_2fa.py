import pytest

from auth_2fa import TwoFactorFailedError, TwoFactorVerifier, compute_totp


def test_totp_and_single_use_backup_code() -> None:
    secret = b"12345678901234567890"
    verifier = TwoFactorVerifier(clock=lambda: 90)  # step = 3
    code = compute_totp(secret, 3)

    res1 = verifier.verify(secret_bytes=secret, backup_codes={"b1", "b2"}, submitted=code)
    assert res1.ok and res1.remaining_backup_codes == frozenset({"b1", "b2"})

    res2 = verifier.verify(secret_bytes=secret, backup_codes={"b1", "b2"}, submitted="b1")
    assert res2.ok and res2.remaining_backup_codes == frozenset({"b2"})

    with pytest.raises(TwoFactorFailedError):
        verifier.verify(
            secret_bytes=secret,
            backup_codes=res2.remaining_backup_codes,
            submitted="b1",
        )
