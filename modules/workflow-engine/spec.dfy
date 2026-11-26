datatype WorkflowDecision = Ok(nextState: string) | Err(reason: string)

datatype WorkflowDef = WorkflowDef(
  states: set<string>,
  initial: string,
  transitions: map<(string, string), string>
)

ghost predicate ValidWorkflow(def: WorkflowDef)
{
  def.initial in def.states &&
  forall k :: k in def.transitions ==>
    k.0 in def.states && def.transitions[k] in def.states
}

function CanTransition(def: WorkflowDef, current: string, ev: string): bool
  requires ValidWorkflow(def)
{
  (current, ev) in def.transitions
}

function DecideTransition(def: WorkflowDef, current: string, ev: string): WorkflowDecision
  requires ValidWorkflow(def)
  ensures DecideTransition(def, current, ev).Ok? <==> CanTransition(def, current, ev)
  ensures DecideTransition(def, current, ev).Ok? ==>
    DecideTransition(def, current, ev).nextState in def.states
{
  if (current, ev) in def.transitions then
    Ok(def.transitions[(current, ev)])
  else
    Err("No transition '" + ev + "' from state '" + current + "'")
}
