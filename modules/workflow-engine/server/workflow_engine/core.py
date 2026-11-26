from collections.abc import Mapping, Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class WorkflowDefinition:
    states: Sequence[str]
    initial: str
    transitions: Mapping[str, Mapping[str, str]]

    def __post_init__(self) -> None:
        state_set = set(self.states)
        if self.initial not in state_set:
            raise ValueError(f"Initial state {self.initial!r} not in states")
        for src, events in self.transitions.items():
            if src not in state_set:
                raise ValueError(f"Transition source {src!r} not in states")
            for ev, dst in events.items():
                if dst not in state_set:
                    raise ValueError(f"Transition {src!r} --({ev})--> {dst!r} invalid")


@dataclass(frozen=True)
class WorkflowDecision:
    ok: bool
    next_state: str | None = None
    reason: str | None = None


def can_transition(definition: WorkflowDefinition, current: str, event: str) -> bool:
    return event in definition.transitions.get(current, {})


def decide_transition(
    definition: WorkflowDefinition, current: str, event: str
) -> WorkflowDecision:
    events = definition.transitions.get(current)
    if events is None or event not in events:
        return WorkflowDecision(
            ok=False,
            reason=f"No transition '{event}' from state '{current}'",
        )
    return WorkflowDecision(ok=True, next_state=events[event])
