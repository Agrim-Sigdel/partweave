import pytest

from workflow_engine import (
    InvalidTransition,
    WorkflowDefinition,
    WorkflowRunner,
    can_transition,
)

ORDER_WORKFLOW = WorkflowDefinition(
    states=["draft", "submitted", "approved", "cancelled"],
    initial="draft",
    transitions={
        "draft": {"submit": "submitted", "cancel": "cancelled"},
        "submitted": {"approve": "approved", "cancel": "cancelled"},
    },
)


class _Order:
    def __init__(self, state: str = "draft") -> None:
        self.state = state


def test_valid_and_invalid_transitions() -> None:
    logs = []
    runner = WorkflowRunner(ORDER_WORKFLOW, append_log=logs.append)
    order = _Order()

    assert can_transition(ORDER_WORKFLOW, order.state, "submit")
    runner.transition(order, "submit", actor="u1")
    assert order.state == "submitted"
    assert len(logs) == 1 and logs[0].to_state == "submitted"

    with pytest.raises(InvalidTransition):
        runner.transition(order, "submit", actor="u1")
    assert order.state == "submitted"
    assert len(logs) == 1
