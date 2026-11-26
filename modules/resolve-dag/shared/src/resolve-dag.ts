export interface DagNode {
  readonly id: string;
  readonly requires?: readonly string[];
  readonly conflicts?: readonly string[];
  readonly provides?: string;
}

export interface DagResolveResult {
  readonly order: readonly string[];
  readonly autoAdded: readonly string[];
}

export function resolveDagOrder(
  catalog: Readonly<Record<string, DagNode>>,
  chosen: readonly string[],
): DagResolveResult {
  const requested = new Set(chosen);
  const resolved = new Set<string>();
  const autoAdded = new Set<string>();

  const visit = (id: string, stack: string[]): void => {
    if (resolved.has(id)) return;
    if (stack.includes(id)) throw new Error(`Cycle detected: ${[...stack, id].join(" -> ")}`);
    const node = catalog[id];
    if (!node) throw new Error(`Unknown node '${id}'`);
    for (const dep of node.requires ?? []) {
      if (!requested.has(dep)) autoAdded.add(dep);
      visit(dep, [...stack, id]);
    }
    resolved.add(id);
  };

  for (const id of chosen) visit(id, []);

  const provided = new Map<string, string>();
  for (const id of [...resolved].sort()) {
    const node = catalog[id];
    for (const c of node.conflicts ?? []) {
      if (resolved.has(c)) throw new Error(`Conflict between '${id}' and '${c}'`);
    }
    if (node.provides) {
      const other = provided.get(node.provides);
      if (other && other !== id) {
        throw new Error(`Duplicate capability '${node.provides}': '${other}' vs '${id}'`);
      }
      provided.set(node.provides, id);
    }
  }

  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const id of resolved) {
    const deps = (catalog[id].requires ?? []).filter((d) => resolved.has(d));
    indegree.set(id, deps.length);
    dependents.set(id, []);
  }
  for (const id of resolved) {
    for (const dep of catalog[id].requires ?? []) dependents.get(dep)?.push(id);
  }
  const ready = [...resolved].filter((id) => (indegree.get(id) ?? 0) === 0).sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const cur = ready.shift()!;
    order.push(cur);
    for (const nxt of dependents.get(cur) ?? []) {
      const nextDeg = (indegree.get(nxt) ?? 0) - 1;
      indegree.set(nxt, nextDeg);
      if (nextDeg === 0) {
        ready.push(nxt);
        ready.sort();
      }
    }
  }
  return { order, autoAdded: [...autoAdded].sort() };
}
