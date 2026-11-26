export interface TenantContext {
  readonly actorId: string;
  readonly memberTenants: readonly string[];
  readonly activeTenant: string;
  readonly isPlatformAdmin?: boolean;
}

export interface TenantDecision {
  readonly allowed: boolean;
  readonly statusCode: 200 | 403;
  readonly reason: string;
}

export function checkTenantAccess(
  ctx: TenantContext,
  resourceTenant: string,
): TenantDecision {
  if (ctx.isPlatformAdmin) {
    return { allowed: true, statusCode: 200, reason: "platform-admin" };
  }
  if (!new Set(ctx.memberTenants).has(ctx.activeTenant)) {
    return { allowed: false, statusCode: 403, reason: "Actor is not a member of active tenant" };
  }
  if (ctx.activeTenant !== resourceTenant) {
    return { allowed: false, statusCode: 403, reason: "Cross-tenant access denied" };
  }
  return { allowed: true, statusCode: 200, reason: "granted" };
}
