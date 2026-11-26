"""
Proof-erased pure runtime core for rbac.
Derived from specs/rbac_core.dfy.

Zero DB, HTTP, or framework dependencies.
"""

from dataclasses import dataclass
from typing import AbstractSet


@dataclass(frozen=True)
class AuthActor:
    authenticated: bool
    actor_id: str | None = None
    is_superuser: bool = False
    permissions: AbstractSet[str] = frozenset()


@dataclass(frozen=True)
class AuthDecision:
    allowed: bool
    status_code: int
    reason: str


def check_permission(actor: AuthActor, required_perm: str) -> AuthDecision:
    """Pure equivalent of CheckPermission(actor, requiredPerm)."""
    if not actor.authenticated:
        return AuthDecision(
            allowed=False,
            status_code=401,
            reason="Authentication credentials were not provided.",
        )
    if actor.is_superuser or required_perm in actor.permissions:
        return AuthDecision(allowed=True, status_code=200, reason="granted")
    return AuthDecision(
        allowed=False,
        status_code=403,
        reason=f"Missing permission '{required_perm}'",
    )
