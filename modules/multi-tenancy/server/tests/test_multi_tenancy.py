import pytest

from multi_tenancy import CrossTenantDeniedError, TenantContext, TenantGuard


def test_cross_tenant_isolation() -> None:
    guard = TenantGuard()
    ctx = TenantContext(actor_id="u1", member_tenants=frozenset({"t1"}), active_tenant="t1")

    assert guard.enforce(ctx, "t1").allowed
    with pytest.raises(CrossTenantDeniedError):
        guard.enforce(ctx, "t2")

    non_member = TenantContext(actor_id="u1", member_tenants=frozenset({"t1"}), active_tenant="t2")
    with pytest.raises(CrossTenantDeniedError):
        guard.enforce(non_member, "t2")
