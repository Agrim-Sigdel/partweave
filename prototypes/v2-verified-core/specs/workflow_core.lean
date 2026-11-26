-- Lean 4 counterpart of workflow_core.dfy.
-- Propositions (`Prop`, `theorem`) are erased during compilation; only
-- `decideTransition` and data types remain in runtime code.

inductive Decision (α : Type) where
  | ok (value : α)
  | err (reason : String)
  deriving Repr, BEq

structure TransitionRule where
  fromState : String
  event : String
  toState : String
  deriving Repr, BEq

structure WorkflowDef where
  states : List String
  initial : String
  transitions : List TransitionRule
  deriving Repr

def WorkflowDef.isValid (w : WorkflowDef) : Prop :=
  w.initial ∈ w.states ∧
  ∀ r ∈ w.transitions, r.fromState ∈ w.states ∧ r.toState ∈ w.states

def findNext (rules : List TransitionRule) (cur ev : String) : Option String :=
  match rules.find? (fun r => r.fromState == cur && r.event == ev) with
  | some r => some r.toState
  | none   => none

def decideTransition (w : WorkflowDef) (cur ev : String) : Decision String :=
  match findNext w.transitions cur ev with
  | some nextState => Decision.ok nextState
  | none => Decision.err s!"No transition '{ev}' from state '{cur}'"

-- Proof-only theorem (lives in Prop -> completely erased from runtime binary).
theorem valid_transition_stays_in_states
    (w : WorkflowDef) (hValid : w.isValid) (cur ev next : String)
    (hOk : decideTransition w cur ev = Decision.ok next) :
    next ∈ w.states := by
  unfold decideTransition findNext at hOk
  cases hFind : w.transitions.find? (fun r => r.fromState == cur && r.event == ev) with
  | none => simp [hFind] at hOk
  | some rule =>
    simp [hFind] at hOk
    subst hOk
    have hMem : rule ∈ w.transitions := List.mem_of_find?_eq_some hFind
    exact (hValid.2 rule hMem).2
