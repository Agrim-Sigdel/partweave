/**
 * Serializes the module registry into a stable, machine-readable catalog (F5) so
 * an agent can discover what's available — every module's targets, dependencies,
 * conflicts, capability, and env keys — before composing a selection.
 */

import type { Registry } from "./registry.js";
import { APPS, type AppName, type TargetName } from "./types.js";

export interface CatalogModule {
  id: string;
  title: string;
  description: string;
  kind: "app" | "feature";
  targets: TargetName[];
  requiresApps: AppName[];
  requires: string[];
  conflicts: string[];
  provides?: string;
  default: boolean;
  /** env key → default value contributed to the consuming app's .env(.example) */
  env: Record<string, string>;
  notes: string[];
}

export interface Catalog {
  /** the three toggleable apps */
  apps: AppName[];
  /** every feature module, id-sorted */
  modules: CatalogModule[];
}

function serializeModule(m: {
  manifest: import("./types.js").Manifest;
}): CatalogModule {
  const man = m.manifest;
  return {
    id: man.id,
    title: man.title,
    description: man.description ?? "",
    kind: man.kind,
    targets: man.targets,
    requiresApps: man.requiresApps,
    requires: man.requires,
    conflicts: man.conflicts,
    ...(man.provides ? { provides: man.provides } : {}),
    default: man.default,
    env: man.env,
    notes: man.notes,
  };
}

export function serializeCatalog(registry: Registry): Catalog {
  return {
    apps: [...APPS],
    modules: registry.features().map(serializeModule),
  };
}
