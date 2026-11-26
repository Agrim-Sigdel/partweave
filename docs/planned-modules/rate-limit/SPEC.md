# Rate Limit Module Specification

## 1. Feature Context & Goal
Provides endpoint throttling (`rate-limit`) to protect the `server` application from abuse, brute-force attacks, and DoS.

## 2. Security Checklist (Non-Negotiable)
- Must rely on Redis for distributed token bucket tracking (do not use local memory).
- User IDs must be used as the cache key for authenticated users; IP address for anonymous users.
- X-Forwarded-For must be handled correctly if behind a proxy to avoid IP spoofing.

## 3. Data & Request Flow
1. Client makes a request.
2. `rate_limit_middleware` or DRF Throttle class intercepts the request.
3. Checks current bucket in Redis via cache key.
4. If rate limit exceeded, return `429 Too Many Requests` with a `Retry-After` header.
5. If allowed, increments bucket and processes request.

## 4. Anchor Injections
- `server/core/settings.py` -> `# <partweave:settings_rest_framework>` -> adds throttle classes and rates.

## 5. API & DB Contract
- **Throttles**: `BurstRateThrottle`, `SustainedRateThrottle`
- **Cache**: Depends on Django's default cache backend (expected to be Redis via `cache-redis` module).

## 6. Agent Prompt Directive
> "You are a backend Django developer. Using this SPEC.md, implement `throttling.py` containing `BurstRateThrottle` and `SustainedRateThrottle` extending DRF's `SimpleRateThrottle`. Also implement `rate_limit_middleware.py` for global IP protection."
