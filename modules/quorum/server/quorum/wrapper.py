from .core import QuorumState, evaluate_quorum


class DuplicateVoteError(Exception):
    """Raised when a voter votes twice on the same quorum."""


class QuorumClosedError(Exception):
    """Raised when voting on an already resolved quorum."""


class QuorumEngine:
    """State-Machine + Policy Guard Wrapper for k-of-n approval workflows."""

    def __init__(self, *, voters: set[str], threshold: int) -> None:
        self.voters = frozenset(voters)
        self.threshold = threshold
        self.votes: dict[str, bool] = {}
        self.status = "pending"

    def vote(self, voter_id: str, approve: bool) -> QuorumState:
        if self.status != "pending":
            raise QuorumClosedError(f"Quorum already {self.status}")
        if voter_id not in self.voters:
            raise ValueError(f"Unknown voter '{voter_id}'")
        if voter_id in self.votes:
            raise DuplicateVoteError(f"Voter '{voter_id}' already voted")
        self.votes[voter_id] = approve
        approvals = sum(1 for v in self.votes.values() if v)
        rejections = sum(1 for v in self.votes.values() if not v)
        state = evaluate_quorum(
            approvals=approvals,
            rejections=rejections,
            total_voters=len(self.voters),
            threshold=self.threshold,
        )
        self.status = state.status
        return state
