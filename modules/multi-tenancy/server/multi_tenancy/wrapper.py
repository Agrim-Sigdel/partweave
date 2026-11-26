from .core import TenantContext, TenantDecision, check_tenant_access


class CrossTenantDeniedError(Exception):
    """Raised when an actor attempts access outside their active tenant."""


class TenantGuard:
    """Policy / Guard Wrapper: isolates tenant-scoped operations."""

    def enforce(self, ctx: TenantContext, resource_tenant: str) -> TenantDecision:
        decision = check_tenant_access(ctx, resource_tenant)
        if not decision.allowed:
            raise CrossTenantDeniedError(decision.reason)
        return decision
