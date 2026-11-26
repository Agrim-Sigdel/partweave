datatype QuorumStatus = Pending | Approved | Rejected

function EvaluateQuorum(
  approvals: int,
  rejections: int,
  totalVoters: int,
  threshold: int
): QuorumStatus
  requires 0 <= approvals && 0 <= rejections && approvals + rejections <= totalVoters
  requires 1 <= threshold <= totalVoters
{
  if approvals >= threshold then Approved
  else if (totalVoters - rejections) < threshold then Rejected
  else Pending
}
