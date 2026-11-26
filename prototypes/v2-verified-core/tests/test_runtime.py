import sys
import unittest
from contextlib import contextmanager
from pathlib import Path

PROTO_ROOT = Path(__file__).resolve().parent.parent
if str(PROTO_ROOT) not in sys.path:
    sys.path.insert(0, str(PROTO_ROOT))

from cores.rbac_core import AuthActor, check_permission  # noqa: E402
from cores.workflow_core import (  # noqa: E402
    WorkflowDefinition,
    can_transition,
    decide_transition,
)
from templates.runtime_wrapper import (  # noqa: E402
    InvalidTransition,
    PermissionDeniedError,
    UnauthenticatedError,
    make_permission_guard,
    make_transition_runner,
)

ORDER_WORKFLOW = WorkflowDefinition(
    states=["draft", "submitted", "approved", "rejected", "cancelled"],
    initial="draft",
    transitions={
        "draft": {"submit": "submitted", "cancel": "cancelled"},
        "submitted": {"approve": "approved", "reject": "rejected", "cancel": "cancelled"},
    },
)


class FakeOrder:
    def __init__(self, state: str = "draft") -> None:
        self.state = state


class WorkflowTemplateTests(unittest.TestCase):
    def test_rejects_invalid_workflow_definition(self) -> None:
        with self.assertRaises(ValueError):
            WorkflowDefinition(
                states=["draft", "submitted"],
                initial="draft",
                transitions={"draft": {"ship": "ghost_state"}},
            )

    def test_valid_transitions_update_state_and_append_log_atomically(self) -> None:
        logs: list[dict[str, object]] = []
        atomic_entries = 0

        @contextmanager
        def track_atomic():
            nonlocal atomic_entries
            atomic_entries += 1
            yield

        run_transition = make_transition_runner(
            definition=ORDER_WORKFLOW,
            decide_fn=decide_transition,
            load_state=lambda obj: obj.state,
            save_state=lambda obj, s: setattr(obj, "state", s),
            append_log=lambda obj, f, t, ev, actor: logs.append(
                {"obj": obj, "from": f, "to": t, "event": ev, "actor": actor}
            ),
            atomic_ctx=track_atomic,
        )

        order = FakeOrder()
        self.assertTrue(can_transition(ORDER_WORKFLOW, order.state, "submit"))
        run_transition(order, "submit", actor="user:1")
        run_transition(order, "approve", actor="user:2")

        self.assertEqual(order.state, "approved")
        self.assertEqual(atomic_entries, 2)
        self.assertEqual(
            [(entry["from"], entry["to"], entry["event"]) for entry in logs],
            [("draft", "submitted", "submit"), ("submitted", "approved", "approve")],
        )

    def test_invalid_transition_raises_without_mutating_state_or_log(self) -> None:
        logs: list[dict[str, object]] = []
        run_transition = make_transition_runner(
            definition=ORDER_WORKFLOW,
            decide_fn=decide_transition,
            load_state=lambda obj: obj.state,
            save_state=lambda obj, s: setattr(obj, "state", s),
            append_log=lambda obj, f, t, ev, actor: logs.append({"event": ev}),
        )

        order = FakeOrder("draft")
        self.assertFalse(can_transition(ORDER_WORKFLOW, order.state, "approve"))
        with self.assertRaises(InvalidTransition):
            run_transition(order, "approve", actor="user:1")

        self.assertEqual(order.state, "draft")
        self.assertEqual(logs, [])


class RbacTemplateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.guard = make_permission_guard(
            decide_fn=check_permission,
            extract_actor=lambda req: req["actor"],
        )

    def test_anonymous_actor_raises_unauthenticated(self) -> None:
        with self.assertRaises(UnauthenticatedError):
            self.guard({"actor": AuthActor(authenticated=False)}, "orders.approve")

    def test_missing_permission_raises_forbidden(self) -> None:
        actor = AuthActor(
            authenticated=True,
            actor_id="u1",
            permissions=frozenset({"orders.view"}),
        )
        with self.assertRaises(PermissionDeniedError):
            self.guard({"actor": actor}, "orders.approve")

    def test_granted_permission_and_superuser_pass(self) -> None:
        reviewer = AuthActor(
            authenticated=True,
            actor_id="u2",
            permissions=frozenset({"orders.approve"}),
        )
        superuser = AuthActor(authenticated=True, actor_id="admin", is_superuser=True)

        self.assertEqual(self.guard({"actor": reviewer}, "orders.approve").status_code, 200)
        self.assertEqual(self.guard({"actor": superuser}, "anything.else").status_code, 200)


if __name__ == "__main__":
    unittest.main()
