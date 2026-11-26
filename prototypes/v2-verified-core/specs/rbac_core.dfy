// Formal specification for rbac's pure permission evaluation kernel.
// Security invariants from docs/planned-modules/rbac/SPEC.md:
//   - Unauthenticated actors always get 401.
//   - Superusers implicitly pass all permission checks (when authenticated).
//   - Non-superusers pass iff the required permission is in their granted set;
//     otherwise 403.

datatype AuthActor =
  | Anonymous
  | Authenticated(id: string, isSuperuser: bool, permissions: set<string>)

datatype AuthDecision = AuthDecision(
  allowed: bool,
  statusCode: int,
  reason: string
)

function CheckPermission(actor: AuthActor, requiredPerm: string): AuthDecision
  ensures actor.Anonymous? ==> !CheckPermission(actor, requiredPerm).allowed &&
    CheckPermission(actor, requiredPerm).statusCode == 401
  ensures actor.Authenticated? && actor.isSuperuser ==>
    CheckPermission(actor, requiredPerm).allowed &&
    CheckPermission(actor, requiredPerm).statusCode == 200
  ensures actor.Authenticated? && !actor.isSuperuser && !(requiredPerm in actor.permissions) ==>
    !CheckPermission(actor, requiredPerm).allowed &&
    CheckPermission(actor, requiredPerm).statusCode == 403
  ensures actor.Authenticated? && (actor.isSuperuser || requiredPerm in actor.permissions) ==>
    CheckPermission(actor, requiredPerm).allowed &&
    CheckPermission(actor, requiredPerm).statusCode == 200
{
  match actor
  case Anonymous =>
    AuthDecision(false, 401, "Authentication credentials were not provided.")
  case Authenticated(_, isSuperuser, permissions) =>
    if isSuperuser || requiredPerm in permissions then
      AuthDecision(true, 200, "granted")
    else
      AuthDecision(false, 403, "Missing permission '" + requiredPerm + "'")
}
