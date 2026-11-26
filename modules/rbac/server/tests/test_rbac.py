import pytest

from rbac import PermissionDeniedError, PolicyGuard, RbacActor, UnauthenticatedError


def test_rbac_guard_invariants() -> None:
    guard = PolicyGuard()
    with pytest.raises(UnauthenticatedError):
        guard.enforce(RbacActor(authenticated=False), "orders.approve")

    with pytest.raises(PermissionDeniedError):
        guard.enforce(
            RbacActor(authenticated=True, actor_id="u1", permissions=frozenset({"orders.view"})),
            "orders.approve",
        )

    assert (
        guard.enforce(
            RbacActor(
                authenticated=True,
                actor_id="u2",
                permissions=frozenset({"orders.approve"}),
            ),
            "orders.approve",
        ).status_code
        == 200
    )
    assert guard.enforce(RbacActor(authenticated=True, is_superuser=True), "any").allowed
