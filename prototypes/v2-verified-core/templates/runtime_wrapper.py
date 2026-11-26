"""
Common template wrapper functions (the "abstract / effectful shell" layer).

These wrappers stay framework-agnostic and reusable across modules: callers plug
in a verified pure core function plus abstract storage/auth adapters, and the
wrapper enforces atomic commits, immutable audit logging, and HTTP error mapping.
"""

from contextlib import contextmanager
from typing import Any, Callable, ContextManager, Iterator

from cores.rbac_core import AuthActor, AuthDecision
from cores.workflow_core import Decision, WorkflowDefinition


class InvalidTransition(Exception):
    """Raised when a verified state-machine core rejects a transition."""


class UnauthenticatedError(Exception):
    """Mapped to HTTP 401 by the web/Django shell."""


class PermissionDeniedError(Exception):
    """Mapped to HTTP 403 by the web/Django shell."""


@contextmanager
def noop_atomic() -> Iterator[None]:
    """Default no-op atomic context for in-memory or unit-test shells."""
    yield


def make_transition_runner(
    *,
    definition: WorkflowDefinition,
    decide_fn: Callable[[WorkflowDefinition, str, str], Decision],
    load_state: Callable[[Any], str],
    save_state: Callable[[Any, str], None],
    append_log: Callable[[Any, str, str, str, Any], None],
    atomic_ctx: Callable[[], ContextManager[None]] = noop_atomic,
) -> Callable[[Any, str, Any], Any]:
    """
    Common template builder for stateful lifecycle modules (e.g. workflow-engine).
    Wraps a pure `decide_fn(definition, current_state, event) -> Decision` with
    atomic persistence and append-only audit logging.
    """

    def run_transition(instance: Any, event: str, actor: Any = None) -> Any:
        from_state = load_state(instance)
        decision = decide_fn(definition, from_state, event)
        if not decision.ok or decision.value is None:
            raise InvalidTransition(decision.error or "Illegal transition")

        to_state = decision.value
        with atomic_ctx():
            save_state(instance, to_state)
            append_log(instance, from_state, to_state, event, actor)
        return instance

    return run_transition


def make_permission_guard(
    *,
    decide_fn: Callable[[AuthActor, str], AuthDecision],
    extract_actor: Callable[[Any], AuthActor],
) -> Callable[[Any, str], AuthDecision]:
    """
    Common template builder for authorization modules (e.g. rbac).
    Wraps a pure `decide_fn(actor, required_perm) -> AuthDecision` with request
    actor extraction and standard 401/403 exception mapping.
    """

    def guard(request: Any, required_perm: str) -> AuthDecision:
        actor = extract_actor(request)
        decision = decide_fn(actor, required_perm)
        if not decision.allowed:
            if decision.status_code == 401:
                raise UnauthenticatedError(decision.reason)
            raise PermissionDeniedError(decision.reason)
        return decision

    return guard
