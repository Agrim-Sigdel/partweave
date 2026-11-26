const DEFAULT_SENSITIVE = new Set([
  "password",
  "passwd",
  "token",
  "secret",
  "api_key",
  "authorization",
  "refresh",
]);

export interface AuditDiffEntry {
  readonly before: unknown;
  readonly after: unknown;
}

export function scrubAuditPayload(
  value: unknown,
  sensitive: ReadonlySet<string> = DEFAULT_SENSITIVE,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => scrubAuditPayload(item, sensitive));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = sensitive.has(k.toLowerCase())
        ? "[REDACTED]"
        : scrubAuditPayload(v, sensitive);
    }
    return out;
  }
  return value;
}
