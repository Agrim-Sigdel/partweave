/**
 * Proof-erased pure runtime core for workflow-engine (JS/TS target).
 * Derived from specs/workflow_core.dfy & specs/workflow_core.lean.
 */

export function validateWorkflow(def) {
  const stateSet = new Set(def.states);
  if (!stateSet.has(def.initial)) {
    throw new Error(`Initial state '${def.initial}' is not in states`);
  }
  for (const [fromState, events] of Object.entries(def.transitions)) {
    if (!stateSet.has(fromState)) {
      throw new Error(`Transition source '${fromState}' is not in states`);
    }
    for (const [ev, toState] of Object.entries(events)) {
      if (!stateSet.has(toState)) {
        throw new Error(
          `Transition '${fromState}' --(${ev})--> '${toState}' targets unknown state`,
        );
      }
    }
  }
}

export function canTransition(def, currentState, event) {
  const events = def.transitions[currentState];
  return Boolean(events && Object.prototype.hasOwnProperty.call(events, event));
}

export function decideTransition(def, currentState, event) {
  if (!canTransition(def, currentState, event)) {
    return {
      ok: false,
      value: null,
      error: `No transition '${event}' from state '${currentState}'`,
    };
  }
  return {
    ok: true,
    value: def.transitions[currentState][event],
    error: null,
  };
}
