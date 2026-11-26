from collections.abc import Callable
from contextlib import AbstractContextManager, nullcontext
from dataclasses import dataclass
from typing import Any

from .core import WorkflowDefinition, decide_transition


class InvalidTransition(Exception):
    """Raised when a workflow transition violates the declared state machine."""


@dataclass(frozen=True)
class WorkflowLogEntry:
    target: Any
    from_state: str
    to_state: str
    event: str
    actor: Any = None


class WorkflowRunner:
    """State-Machine Wrapper: runs verified transitions atomically and logs changes."""

    def __init__(
        self,
        definition: WorkflowDefinition,
        *,
        load_state: Callable[[Any], str] | None = None,
        save_state: Callable[[Any, str], None] | None = None,
        append_log: Callable[[WorkflowLogEntry], None] | None = None,
        atomic_ctx: Callable[[], AbstractContextManager[Any]] | None = None,
    ) -> None:
        self.definition = definition
        self.load_state = load_state or (lambda obj: obj.state)
        self.save_state = save_state or (lambda obj, s: setattr(obj, "state", s))
        self.append_log = append_log
        self.atomic_ctx = atomic_ctx or nullcontext

    def can_transition(self, instance: Any, event: str) -> bool:
        return decide_transition(self.definition, self.load_state(instance), event).ok

    def transition(self, instance: Any, event: str, actor: Any = None) -> Any:
        from_state = self.load_state(instance)
        decision = decide_transition(self.definition, from_state, event)
        if not decision.ok or decision.next_state is None:
            raise InvalidTransition(decision.reason or "Illegal transition")

        to_state = decision.next_state
        with self.atomic_ctx():
            self.save_state(instance, to_state)
            if self.append_log is not None:
                self.append_log(
                    WorkflowLogEntry(
                        target=instance,
                        from_state=from_state,
                        to_state=to_state,
                        event=event,
                        actor=actor,
                    )
                )
        return instance
