from collections.abc import Callable
from typing import Any

from .core import RbacActor, RbacDecision, check_permission


class UnauthenticatedError(Exception):
    """Raised on HTTP 401 policy rejections."""


class PermissionDeniedError(Exception):
    """Raised on HTTP 403 policy rejections."""


class PolicyGuard:
    """Policy / Guard Wrapper: maps verified RBAC decisions to 401/403 exceptions."""

    def __init__(self, extract_actor: Callable[[Any], RbacActor] | None = None) -> None:
        self.extract_actor = extract_actor or (lambda actor: actor)

    def enforce(self, subject: Any, required_perm: str) -> RbacDecision:
        actor = self.extract_actor(subject)
        decision = check_permission(actor, required_perm)
        if not decision.allowed:
            if decision.status_code == 401:
                raise UnauthenticatedError(decision.reason)
            raise PermissionDeniedError(decision.reason)
        return decision
