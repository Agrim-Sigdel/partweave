export interface RbacActor {
  readonly authenticated: boolean;
  readonly actorId?: string;
  readonly isSuperuser?: boolean;
  readonly permissions?: readonly string[];
}

export interface RbacDecision {
  readonly allowed: boolean;
  readonly statusCode: 200 | 401 | 403;
  readonly reason: string;
}

export function checkRbacPermission(actor: RbacActor, requiredPerm: string): RbacDecision {
  if (!actor.authenticated) {
    return { allowed: false, statusCode: 401, reason: "Authentication required" };
  }
  const perms = new Set(actor.permissions ?? []);
  if (actor.isSuperuser || perms.has(requiredPerm)) {
    return { allowed: true, statusCode: 200, reason: "granted" };
  }
  return { allowed: false, statusCode: 403, reason: `Missing permission '${requiredPerm}'` };
}
