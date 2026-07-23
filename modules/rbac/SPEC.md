# RBAC Module Specification

## 1. Feature Context & Goal
Provides robust Role-Based Access Control (`rbac`) for the `server` application. It allows assigning Roles to Users, and Permissions to Roles. It provides decorators for view functions and Permission classes for Django REST Framework (DRF).

## 2. Security Checklist (Non-Negotiable)
- All permissions must be strictly verified against the authenticated user.
- Endpoints wrapped in `@has_permission` must reject unauthenticated requests with `401 Unauthorized` and unauthorized requests with `403 Forbidden`.
- Superusers implicitly pass all permission checks.

## 3. Data & Request Flow
1. Client requests an endpoint.
2. The view checks `has_permission(user, 'required_permission')`.
3. System joins User -> UserRole -> Role -> RolePermission.
4. If a match is found (or user is superuser), access is granted. Otherwise, `PermissionDenied` is raised.

## 4. Anchor Injections
- `server/core/settings.py` -> `# <partweave:settings_installed_apps>` -> adds `"core.rbac",`

## 5. API & DB Contract
- **Models**: `Role`, `Permission`, `UserRole`, `RolePermission`
- **Functions**: `has_permission(user, permission_codename)`
- **Decorators**: `@require_permission(codename)`
- **DRF**: `class HasPermission(BasePermission)`

## 6. Agent Prompt Directive
> "You are a backend Django developer. Using this SPEC.md, implement the `models.py`, `permissions.py`, `decorators.py`, and `admin.py` for the RBAC module. Ensure `require_permission` properly raises a `403` if the check fails."
