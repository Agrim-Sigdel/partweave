# Audit Log Module Specification

## 1. Feature Context & Goal
Provides immutable security and action tracking (`audit-log`) for the `server`. Logs who performed what action on which resource, tracking IP, time, and data diffs.

## 2. Security Checklist (Non-Negotiable)
- The Audit Log model must be read-only at the application level.
- Must capture IP address (handling `X-Forwarded-For` safely).
- Sensitive fields (e.g., passwords, API keys) must be scrubbed from the logged request/response payloads before saving.

## 3. Data & Request Flow
1. Client makes a request that modifies state (POST, PUT, PATCH, DELETE).
2. `AuditLogMiddleware` intercepts the request.
3. Views process the request.
4. On response, the middleware captures the response status, user ID, IP address, request path, and payload (scrubbed).
5. An `AuditEvent` record is saved to the database asynchronously or synchronously.

## 4. Anchor Injections
- `server/core/settings.py` -> `# <partweave:settings_installed_apps>` -> adds `"core.audit_log",`
- `server/core/settings.py` -> `# <partweave:settings_middleware>` -> adds `"core.audit_log.middleware.AuditLogMiddleware",`

## 5. API & DB Contract
- **Models**: `AuditEvent`
  - Fields: `actor` (FK User), `ip_address` (GenericIPAddress), `action` (CharField), `resource` (CharField), `payload` (JSONField), `timestamp` (DateTimeField).

## 6. Agent Prompt Directive
> "You are a backend Django developer. Using this SPEC.md, implement `models.py` defining the `AuditEvent` model, and `middleware.py` containing `AuditLogMiddleware`. Ensure sensitive fields like 'password' are redacted from the logged payload."
