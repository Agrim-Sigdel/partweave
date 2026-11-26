/**
 * Proof-erased pure runtime core for rbac (JS/TS target).
 * Derived from specs/rbac_core.dfy.
 */

export function checkPermission(actor, requiredPerm) {
  if (!actor || !actor.authenticated) {
    return {
      allowed: false,
      statusCode: 401,
      reason: "Authentication credentials were not provided.",
    };
  }
  const perms = actor.permissions instanceof Set
    ? actor.permissions
    : new Set(actor.permissions ?? []);
  if (actor.isSuperuser || perms.has(requiredPerm)) {
    return { allowed: true, statusCode: 200, reason: "granted" };
  }
  return {
    allowed: false,
    statusCode: 403,
    reason: `Missing permission '${requiredPerm}'`,
  };
}
