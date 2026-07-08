import type { Registry } from "./registry.js";
import type { AppName } from "./types.js";

export interface ResolveResult {
  /** final module id list, dependency-complete, stably ordered */
  modules: string[];
  /** ids that were pulled in automatically to satisfy `requires` */
  autoAdded: string[];
}

/**
 * Expands `requires` transitively and rejects `conflicts`. Throws with a clear
 * message on unknown ids or conflicting pairs.
 */
export function resolveModules(
  registry: Registry,
  chosen: string[],
): ResolveResult {
  const requested = new Set(chosen);
  const resolved = new Set<string>();
  const autoAdded = new Set<string>();

  const visit = (id: string, stack: string[]): void => {
    if (resolved.has(id)) return;
    if (stack.includes(id)) {
      throw new Error(
        `Circular module dependency: ${[...stack, id].join(" → ")}`,
      );
    }
    const mod = registry.get(id);
    if (!mod) {
      throw new Error(`Unknown module: "${id}"`);
    }
    for (const dep of mod.manifest.requires) {
      if (!requested.has(dep)) autoAdded.add(dep);
      visit(dep, [...stack, id]);
    }
    resolved.add(id);
  };

  for (const id of chosen) visit(id, []);

  // conflict detection (both explicit `conflicts` and same `provides` capability)
  const provided = new Map<string, string>(); // capability → module id
  for (const id of resolved) {
    const mod = registry.require(id);
    for (const c of mod.manifest.conflicts) {
      if (resolved.has(c)) {
        throw new Error(`Modules "${id}" and "${c}" conflict and cannot both be selected.`);
      }
    }
    const cap = mod.manifest.provides;
    if (cap) {
      const other = provided.get(cap);
      if (other && other !== id) {
        throw new Error(
          `Modules "${id}" and "${other}" both provide "${cap}"; pick one.`,
        );
      }
      provided.set(cap, id);
    }
  }

  // stable order: sort by (number of deps, id) so deps precede dependents
  const order = [...resolved].sort((a, b) => {
    const da = registry.require(a).manifest.requires.length;
    const db = registry.require(b).manifest.requires.length;
    return da - db || a.localeCompare(b);
  });

  return { modules: order, autoAdded: [...autoAdded].sort() };
}

/**
 * Ensures every resolved module's `requiresApps` are in the chosen app set.
 * Throws a clear message listing the offending module → missing app.
 */
export function validateApps(
  registry: Registry,
  moduleIds: string[],
  apps: AppName[],
): void {
  const have = new Set(apps);
  const problems: string[] = [];
  for (const id of moduleIds) {
    const mod = registry.require(id);
    for (const app of mod.manifest.requiresApps) {
      if (!have.has(app)) {
        problems.push(`"${mod.manifest.id}" needs the ${app} app`);
      }
    }
  }
  if (problems.length) {
    throw new Error(
      `Incompatible selection:\n  - ${problems.join("\n  - ")}\n` +
        `Enable the required app(s) or drop the component(s).`,
    );
  }
}
