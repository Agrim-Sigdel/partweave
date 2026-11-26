datatype TenantContext = TenantContext(
  actorId: string,
  memberTenants: set<string>,
  activeTenant: string,
  isPlatformAdmin: bool
)

datatype TenantDecision = TenantDecision(allowed: bool, statusCode: int, reason: string)

function CheckTenantAccess(ctx: TenantContext, resourceTenant: string): TenantDecision
  ensures ctx.activeTenant != resourceTenant && !ctx.isPlatformAdmin ==>
    !CheckTenantAccess(ctx, resourceTenant).allowed &&
    CheckTenantAccess(ctx, resourceTenant).statusCode == 403
  ensures !ctx.isPlatformAdmin && !(ctx.activeTenant in ctx.memberTenants) ==>
    !CheckTenantAccess(ctx, resourceTenant).allowed
{
  if ctx.isPlatformAdmin then
    TenantDecision(true, 200, "platform-admin")
  else if !(ctx.activeTenant in ctx.memberTenants) then
    TenantDecision(false, 403, "Actor is not a member of active tenant")
  else if ctx.activeTenant != resourceTenant then
    TenantDecision(false, 403, "Cross-tenant access denied")
  else
    TenantDecision(true, 200, "granted")
}
