export interface ApiKeyRecord {
  readonly keyPrefix: string;
  readonly revoked: boolean;
  readonly expiresAtEpoch: number;
  readonly scopes: readonly string[];
}

export interface ApiKeyDecision {
  readonly allowed: boolean;
  readonly statusCode: 200 | 401 | 403;
  readonly reason: string;
}

export function validateApiKey(
  rec: ApiKeyRecord,
  expectedPrefix: string,
  nowEpoch: number,
  requiredScope: string,
): ApiKeyDecision {
  if (rec.keyPrefix !== expectedPrefix) {
    return { allowed: false, statusCode: 401, reason: "Invalid API key prefix" };
  }
  if (rec.revoked) {
    return { allowed: false, statusCode: 401, reason: "API key revoked" };
  }
  if (rec.expiresAtEpoch <= nowEpoch) {
    return { allowed: false, statusCode: 401, reason: "API key expired" };
  }
  if (!new Set(rec.scopes).has(requiredScope)) {
    return { allowed: false, statusCode: 403, reason: `Missing API key scope '${requiredScope}'` };
  }
  return { allowed: true, statusCode: 200, reason: "granted" };
}
