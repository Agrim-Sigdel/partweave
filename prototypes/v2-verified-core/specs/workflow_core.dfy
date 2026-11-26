// Formal specification for workflow-engine's pure transition kernel.
// Everything in `requires` / `ensures` / `ghost` is checked by Z3 at compile
// time and erased before emitting runtime Python / JavaScript code.

datatype Decision<T> = Ok(value: T) | Err(reason: string)

datatype WorkflowDef = WorkflowDef(
  states: set<string>,
  initial: string,
  // Map from (fromState, event) -> toState
  transitions: map<(string, string), string>
)

ghost predicate ValidWorkflow(def: WorkflowDef)
{
  def.initial in def.states &&
  forall k :: k in def.transitions ==>
    k.0 in def.states && def.transitions[k] in def.states
}

function CanTransition(def: WorkflowDef, currentState: string, ev: string): bool
  requires ValidWorkflow(def)
{
  (currentState, ev) in def.transitions
}

function DecideTransition(def: WorkflowDef, currentState: string, ev: string): Decision<string>
  requires ValidWorkflow(def)
  ensures DecideTransition(def, currentState, ev).Ok? <==> CanTransition(def, currentState, ev)
  ensures DecideTransition(def, currentState, ev).Ok? ==>
    DecideTransition(def, currentState, ev).value in def.states
  ensures !CanTransition(def, currentState, ev) ==> DecideTransition(def, currentState, ev).Err?
{
  if (currentState, ev) in def.transitions then
    Ok(def.transitions[(currentState, ev)])
  else
    Err("No transition '" + ev + "' from state '" + currentState + "'")
}
