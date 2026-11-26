"""
Proof-erased pure runtime core for workflow-engine.
Derived from specs/workflow_core.dfy & specs/workflow_core.lean.

Zero DB, HTTP, or framework dependencies — only pure data + decisions.
"""

from dataclasses import dataclass
from typing import Mapping, Sequence


@dataclass(frozen=True)
class WorkflowDefinition:
    states: Sequence[str]
    initial: str
    transitions: Mapping[str, Mapping[str, str]]

    def __post_init__(self) -> None:
        state_set = set(self.states)
        if self.initial not in state_set:
            raise ValueError(f"Initial state '{self.initial}' is not in states {list(self.states)}")
        for from_state, events in self.transitions.items():
            if from_state not in state_set:
                raise ValueError(f"Transition source '{from_state}' is not in states")
            for event, to_state in events.items():
                if to_state not in state_set:
                    raise ValueError(
                        f"Transition '{from_state}' --({event})--> '{to_state}' targets unknown state"
                    )


@dataclass(frozen=True)
class Decision:
    ok: bool
    value: str | None = None
    error: str | None = None


def can_transition(definition: WorkflowDefinition, current_state: str, event: str) -> bool:
    """Pure equivalent of CanTransition(def, currentState, ev)."""
    return event in definition.transitions.get(current_state, {})


def decide_transition(
    definition: WorkflowDefinition, current_state: str, event: str
) -> Decision:
    """Pure equivalent of DecideTransition(def, currentState, ev)."""
    events = definition.transitions.get(current_state)
    if events is None or event not in events:
        return Decision(
            ok=False,
            error=f"No transition '{event}' from state '{current_state}'",
        )
    return Decision(ok=True, value=events[event])
