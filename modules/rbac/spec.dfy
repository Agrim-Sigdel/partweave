datatype RbacActor =
  | Anonymous
  | Authenticated(id: string, isSuperuser: bool, permissions: set<string>)

datatype RbacDecision = RbacDecision(allowed: bool, statusCode: int, reason: string)

function CheckPermission(actor: RbacActor, requiredPerm: string): RbacDecision
  ensures actor.Anonymous? ==>
    !CheckPermission(actor, requiredPerm).allowed &&
    CheckPermission(actor, requiredPerm).statusCode == 401
  ensures actor.Authenticated? && actor.isSuperuser ==>
    CheckPermission(actor, requiredPerm).allowed &&
    CheckPermission(actor, requiredPerm).statusCode == 200
  ensures actor.Authenticated? && !actor.isSuperuser && !(requiredPerm in actor.permissions) ==>
    !CheckPermission(actor, requiredPerm).allowed &&
    CheckPermission(actor, requiredPerm).statusCode == 403
{
  match actor
  case Anonymous => RbacDecision(false, 401, "Authentication required")
  case Authenticated(_, isSuperuser, permissions) =>
    if isSuperuser || requiredPerm in permissions then
      RbacDecision(true, 200, "granted")
    else
      RbacDecision(false, 403, "Missing permission '" + requiredPerm + "'")
}
