from dataclasses import dataclass


@dataclass(frozen=True)
class QuorumState:
    status: str
    approvals: int
    rejections: int


def evaluate_quorum(
    *,
    approvals: int,
    rejections: int,
    total_voters: int,
    threshold: int,
) -> QuorumState:
    if (
        approvals < 0
        or rejections < 0
        or total_voters < 1
        or approvals + rejections > total_voters
        or not (1 <= threshold <= total_voters)
    ):
        raise ValueError("Invalid quorum counts")
    if approvals >= threshold:
        return QuorumState("approved", approvals, rejections)
    if (total_voters - rejections) < threshold:
        return QuorumState("rejected", approvals, rejections)
    return QuorumState("pending", approvals, rejections)
