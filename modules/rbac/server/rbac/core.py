from collections.abc import Set as AbstractSet
from dataclasses import dataclass


@dataclass(frozen=True)
class RbacActor:
    authenticated: bool
    actor_id: str | None = None
    is_superuser: bool = False
    permissions: AbstractSet[str] = frozenset()


@dataclass(frozen=True)
class RbacDecision:
    allowed: bool
    status_code: int
    reason: str


def check_permission(actor: RbacActor, required_perm: str) -> RbacDecision:
    if not actor.authenticated:
        return RbacDecision(False, 401, "Authentication required")
    if actor.is_superuser or required_perm in actor.permissions:
        return RbacDecision(True, 200, "granted")
    return RbacDecision(False, 403, f"Missing permission '{required_perm}'")
