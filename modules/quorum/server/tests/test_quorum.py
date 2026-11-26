import pytest

from quorum import DuplicateVoteError, QuorumClosedError, QuorumEngine


def test_quorum_approval_and_rejection() -> None:
    q = QuorumEngine(voters={"a", "b", "c"}, threshold=2)
    assert q.vote("a", True).status == "pending"
    with pytest.raises(DuplicateVoteError):
        q.vote("a", False)
    assert q.vote("b", True).status == "approved"
    with pytest.raises(QuorumClosedError):
        q.vote("c", True)

    q2 = QuorumEngine(voters={"a", "b", "c"}, threshold=2)
    assert q2.vote("a", False).status == "pending"
    assert q2.vote("b", False).status == "rejected"
