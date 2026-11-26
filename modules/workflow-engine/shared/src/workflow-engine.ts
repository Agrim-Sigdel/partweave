export interface WorkflowDefinition {
  readonly states: readonly string[];
  readonly initial: string;
  readonly transitions: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export interface WorkflowDecision {
  readonly ok: boolean;
  readonly nextState: string | null;
  readonly reason: string | null;
}

export function canWorkflowTransition(
  def: WorkflowDefinition,
  current: string,
  event: string,
): boolean {
  const events = def.transitions[current];
  return Boolean(events && Object.prototype.hasOwnProperty.call(events, event));
}

export function decideWorkflowTransition(
  def: WorkflowDefinition,
  current: string,
  event: string,
): WorkflowDecision {
  if (!canWorkflowTransition(def, current, event)) {
    return {
      ok: false,
      nextState: null,
      reason: `No transition '${event}' from state '${current}'`,
    };
  }
  return {
    ok: true,
    nextState: def.transitions[current][event],
    reason: null,
  };
}
