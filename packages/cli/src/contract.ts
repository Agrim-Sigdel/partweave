import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { APPS, type AppName, type Module } from "./types.js";

/**
 * Coherence validation (F-contract). `ManifestSchema` (in types.ts) proves a
 * manifest is *well-typed*; it can't prove it's *meaningful*. A module can pass
 * the schema and still be self-contradictory: wire a target it never declares,
 * declare a target it does nothing for, or require an app it can't reach. These
 * are the checks the schema can't express, run once per module at load time.
 */

const APP_SET = new Set<string>(APPS);

/**
 * Every app a module can legitimately depend on: the apps it targets directly,
 * plus the apps reachable through its `requires` closure. This is why `example`
 * (targets web/mobile, requires auth) may legally `requiresApps: ["server"]` —
 * server comes in through auth. `catalog` (id → Module) resolves the closure;
 * omit it to consider the module's own targets only.
 */
function derivableApps(mod: Module, catalog?: Map<string, Module>): Set<AppName> {
  const apps = new Set<AppName>();
  const seen = new Set<string>();
  const visit = (m: Module): void => {
    if (seen.has(m.manifest.id)) return;
    seen.add(m.manifest.id);
    for (const t of m.manifest.targets) {
      if (APP_SET.has(t)) apps.add(t as AppName);
    }
    if (!catalog) return;
    for (const reqId of m.manifest.requires) {
      const req = catalog.get(reqId);
      if (req) visit(req);
    }
  };
  visit(mod);
  return apps;
}

function hasTemplateDir(dir: string, target: string): boolean {
  const sub = join(dir, target);
  return existsSync(sub) && statSync(sub).isDirectory();
}

/**
 * Return a list of coherence problems for a loaded module (empty ⇒ coherent).
 * Each message names the offending module id and the specific problem, so the
 * caller can throw them verbatim. Rules enforced:
 *
 *   1. Every `wiring` key must be one of the module's declared `targets` — you
 *      can't inject into a target you don't contribute to.
 *   2. No "dead" target: a declared target must have EITHER a `<target>/`
 *      template dir on disk OR wiring for it. (The `root` target is exempt: it
 *      is the computed monorepo shell, so a module may contribute to it purely
 *      via codegen — e.g. the `ci` marker — with neither files nor wiring.)
 *   3. Every `requiresApps` entry must be derivable from the module's targets
 *      or its `requires` closure (see `derivableApps`).
 */
export function checkCoherence(mod: Module, catalog?: Map<string, Module>): string[] {
  const problems: string[] = [];
  const { manifest, dir } = mod;
  const id = manifest.id;
  const targets = new Set<string>(manifest.targets);

  // Rule 1 — wiring for an undeclared target.
  for (const key of Object.keys(manifest.wiring)) {
    if (!targets.has(key)) {
      problems.push(
        `module "${id}": has wiring for target "${key}" but "${key}" is not in ` +
          `targets [${manifest.targets.join(", ")}]`,
      );
    }
  }

  // Rule 2 — dead target (root exempt: computed shell / codegen marker).
  for (const t of manifest.targets) {
    if (t === "root") continue;
    const hasFiles = hasTemplateDir(dir, t);
    const hasWiring = manifest.wiring[t] !== undefined;
    if (!hasFiles && !hasWiring) {
      problems.push(
        `module "${id}": target "${t}" is dead — no "${t}/" template directory ` +
          `and no wiring for it, so the module contributes nothing to "${t}"`,
      );
    }
  }

  // Rule 3 — requiresApps must be derivable from targets (+ requires closure).
  const derivable = derivableApps(mod, catalog);
  for (const app of manifest.requiresApps) {
    if (!derivable.has(app)) {
      problems.push(
        `module "${id}": requiresApps includes "${app}" but neither this module ` +
          `nor its requires target the "${app}" app`,
      );
    }
  }

  return problems;
}

/** Levenshtein edit distance (insert/delete/substitute), used for did-you-mean. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * The catalog id closest to `id`, or `undefined` when nothing is close enough to
 * be a plausible typo. The threshold scales with the input length so short ids
 * don't collect wild suggestions but a one- or two-character slip still matches.
 */
export function nearestId(id: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;
  for (const cand of candidates) {
    const d = levenshtein(id, cand);
    if (d < bestDist) {
      bestDist = d;
      best = cand;
    }
  }
  if (best === undefined) return undefined;
  const threshold = Math.max(2, Math.floor(id.length / 2));
  return bestDist <= threshold ? best : undefined;
}
