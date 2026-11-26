export type QuorumStatus = "pending" | "approved" | "rejected";

export interface QuorumResult {
  readonly status: QuorumStatus;
  readonly approvals: number;
  readonly rejections: number;
}

export function evaluateQuorumStatus(
  approvals: number,
  rejections: number,
  totalVoters: number,
  threshold: number,
): QuorumResult {
  if (
    approvals < 0 ||
    rejections < 0 ||
    totalVoters < 1 ||
    approvals + rejections > totalVoters ||
    threshold < 1 ||
    threshold > totalVoters
  ) {
    throw new Error("Invalid quorum counts");
  }
  if (approvals >= threshold) return { status: "approved", approvals, rejections };
  if (totalVoters - rejections < threshold) return { status: "rejected", approvals, rejections };
  return { status: "pending", approvals, rejections };
}
