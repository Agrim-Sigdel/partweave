export interface TwoFactorDecision {
  readonly ok: boolean;
  readonly remainingBackupCodes: readonly string[];
  readonly reason: string;
}

export function consumeBackupCode(
  backupCodes: readonly string[],
  submitted: string,
): TwoFactorDecision {
  const codeSet = new Set(backupCodes);
  if (!codeSet.has(submitted)) {
    return { ok: false, remainingBackupCodes: backupCodes, reason: "Invalid backup code" };
  }
  codeSet.delete(submitted);
  return {
    ok: true,
    remainingBackupCodes: [...codeSet],
    reason: "backup-code-consumed",
  };
}
