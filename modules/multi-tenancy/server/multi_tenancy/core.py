from collections.abc import Set as AbstractSet
from dataclasses import dataclass


@dataclass(frozen=True)
class TenantContext:
    actor_id: str
    member_tenants: AbstractSet[str]
    active_tenant: str
    is_platform_admin: bool = False


@dataclass(frozen=True)
class TenantDecision:
    allowed: bool
    status_code: int
    reason: str


def check_tenant_access(ctx: TenantContext, resource_tenant: str) -> TenantDecision:
    if ctx.is_platform_admin:
        return TenantDecision(True, 200, "platform-admin")
    if ctx.active_tenant not in ctx.member_tenants:
        return TenantDecision(False, 403, "Actor is not a member of active tenant")
    if ctx.active_tenant != resource_tenant:
        return TenantDecision(False, 403, "Cross-tenant access denied")
    return TenantDecision(True, 200, "granted")
