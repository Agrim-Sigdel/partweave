from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

from .core import compute_diff, scrub_payload


@dataclass(frozen=True)
class AuditEvent:
    actor_id: str | None
    action: str
    resource: str
    payload: Any
    diff: dict[str, dict[str, Any]]


class AuditRecorder:
    """Pure Transform Wrapper: scrubs sensitive data & diffs before persistence."""

    def __init__(self, sink: Callable[[AuditEvent], None]) -> None:
        self.sink = sink

    def record(
        self,
        *,
        actor_id: str | None,
        action: str,
        resource: str,
        payload: Any,
        before: Mapping[str, Any] | None = None,
        after: Mapping[str, Any] | None = None,
    ) -> AuditEvent:
        diff = (
            compute_diff(before, after)
            if before is not None and after is not None
            else {}
        )
        event = AuditEvent(
            actor_id=actor_id,
            action=action,
            resource=resource,
            payload=scrub_payload(payload),
            diff=diff,
        )
        self.sink(event)
        return event
