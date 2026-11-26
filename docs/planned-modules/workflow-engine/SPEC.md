# Workflow Engine Module Specification

## 1. Feature Context & Goal
Provides a lightweight, dependency-free finite-state-machine engine (`workflow-engine`) for the `server` application. It lets any Django model with a `state` field move through a declared set of states via explicit, named transitions, with every transition recorded in an immutable log. Deliberately minimal — no Celery, no Redis, no third-party state-machine library, pure Python + Django ORM only — so it can be implemented correctly by a plain GenAI in a single pass, with no design decisions left open.

## 2. Security Checklist (Non-Negotiable)
- Transitions must be validated server-side only, against `WorkflowDefinition.transitions` — never trust a `to_state` supplied directly by a client without checking it is a legal transition from the instance's current state.
- `WorkflowLog` rows are append-only: the Django admin registration must disable add, change, and delete permissions for `WorkflowLog` (keep view-only).
- `WorkflowMachine.transition()` must run inside `django.db.transaction.atomic()` so the state change on the target instance and its `WorkflowLog` row commit together or not at all.

## 3. Data & Request Flow
1. Caller obtains a `WorkflowDefinition` for the entity type (a plain dataclass instance defined in application code, e.g. `ORDER_WORKFLOW` — see the worked example below).
2. Caller calls `WorkflowMachine(ORDER_WORKFLOW).transition(instance, event="submit", actor=request.user)`.
3. `transition()` reads `instance.state`, looks it up as a key in `ORDER_WORKFLOW.transitions`, then looks up `event` as a key in that from-state's dict. If either lookup misses, raises `InvalidTransition(f"No transition '{event}' from state '{instance.state}'")`.
4. If the lookup succeeds it yields `to_state`. Inside `transaction.atomic()`: set `instance.state = to_state`, call `instance.save(update_fields=["state"])`, then create one `WorkflowLog` row recording `content_object=instance`, `from_state`, `to_state`, `event`, `actor`, `timestamp` (auto).
5. Return the updated `instance`.

## 4. Anchor Injections
- `server/core/settings.py` -> `# <partweave:settings_installed_apps>` -> adds `"core.workflow_engine",`

## 5. API & DB Contract
- **Models** (`models.py`): `WorkflowLog`
  - `content_type` — `FK` to `django.contrib.contenttypes.models.ContentType`
  - `object_id` — `CharField(max_length=255)`
  - `content_object` — `GenericForeignKey("content_type", "object_id")` (so any model can be logged without a hard FK to it)
  - `from_state` — `CharField(max_length=64)`
  - `to_state` — `CharField(max_length=64)`
  - `event` — `CharField(max_length=64)`
  - `actor` — `FK` to `settings.AUTH_USER_MODEL`, `null=True, blank=True, on_delete=models.SET_NULL`
  - `timestamp` — `DateTimeField(auto_now_add=True)`
- **Exceptions** (`machine.py`): `class InvalidTransition(Exception)`
- **Classes** (`machine.py`):
  - `WorkflowDefinition` — a `dataclasses.dataclass` with fields:
    - `states: list[str]`
    - `initial: str`
    - `transitions: dict[str, dict[str, str]]` — mapping `from_state -> {event: to_state}`
  - `WorkflowMachine`
    - `__init__(self, definition: WorkflowDefinition)`
    - `can_transition(self, instance, event: str) -> bool` — `True` iff `event` is a legal transition from `instance.state`; must not raise.
    - `transition(self, instance, event: str, actor=None)` — performs step 3–5 of the Data & Request Flow above; returns `instance`; raises `InvalidTransition` on an illegal transition.
- **Worked example** — include this exact snippet as a docstring or comment in `machine.py` so the shape is unambiguous:
  ```python
  ORDER_WORKFLOW = WorkflowDefinition(
      states=["draft", "submitted", "approved", "rejected", "cancelled"],
      initial="draft",
      transitions={
          "draft": {"submit": "submitted", "cancel": "cancelled"},
          "submitted": {"approve": "approved", "reject": "rejected", "cancel": "cancelled"},
      },
  )
  ```

## 6. Agent Prompt Directive
> "You are a backend Django developer. Using this SPEC.md exactly and adding no extra files or dependencies beyond Django itself, implement:
> 1. `server/core/workflow_engine/models.py` — the `WorkflowLog` model exactly as specified in section 5, using `django.contrib.contenttypes` for the generic relation.
> 2. `server/core/workflow_engine/machine.py` — the `WorkflowDefinition` dataclass, the `InvalidTransition` exception, and the `WorkflowMachine` class with `can_transition` and `transition` implementing the Data & Request Flow in section 3 exactly, including the `transaction.atomic()` requirement from the Security Checklist. Include the `ORDER_WORKFLOW` worked example from section 5 as a comment.
> 3. `server/core/workflow_engine/admin.py` — register `WorkflowLog` in the Django admin as read-only (override `has_add_permission`, `has_change_permission`, `has_delete_permission` to return `False`).
> 4. `server/core/workflow_engine/apps.py` — a standard Django `AppConfig` named `WorkflowEngineConfig` with `name = "core.workflow_engine"`.
>
> Output each file's full contents, one file at a time, in the order listed above."
