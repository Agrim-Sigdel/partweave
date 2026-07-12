import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REGISTRY_DIR } from "./fetcher.js";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The CLI's own version, read from its package.json so `--version` never drifts
 * from the published package (F36). Walks up from this file — works from src
 * (tsx, `packages/cli/src`) and from the built/packed `dist`. Falls back to
 * "0.0.0" only if the manifest genuinely can't be found.
 */
export function readVersion(): string {
  let cur = here;
  for (let i = 0; i < 8; i++) {
    const pkgPath = join(cur, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
          name?: string;
          version?: string;
        };
        if (pkg.name === "partweave" && pkg.version) return pkg.version;
      } catch {
        // keep walking up on a malformed/unrelated package.json
      }
    }
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return "0.0.0";
}

/**
 * Locate the `modules/` catalog. Order:
 *   1. PARTWEAVE_MODULES_DIR env override
 *   2. walk up from this file looking for a `modules/_core` folder
 * Works whether run from src (tsx) or dist (built).
 */
export function findModulesDir(): string {
  const override = process.env.PARTWEAVE_MODULES_DIR;
  if (override) {
    const abs = resolve(override);
    if (existsSync(join(abs, "_core"))) return abs;
    throw new Error(`PARTWEAVE_MODULES_DIR=${override} has no _core/ inside it`);
  }

  let cur = here;
  for (let i = 0; i < 8; i++) {
    const candidate = join(cur, "modules");
    if (existsSync(join(candidate, "_core"))) return candidate;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }

  // Fallback to the global registry cache (populated by fetcher.ts)
  const registryModules = join(REGISTRY_DIR, "modules");
  if (existsSync(join(registryModules, "_core"))) return registryModules;

  throw new Error(
    "Could not locate the modules/ catalog. Set PARTWEAVE_MODULES_DIR to point at it, or ensure the registry is downloaded.",
  );
}

/**
 * Returns true if the modules directory exists locally (e.g. running in monorepo).
 */
export function hasLocalModules(): boolean {
  if (process.env.PARTWEAVE_MODULES_DIR) {
    const abs = resolve(process.env.PARTWEAVE_MODULES_DIR);
    return existsSync(join(abs, "_core"));
  }

  let cur = here;
  for (let i = 0; i < 8; i++) {
    const candidate = join(cur, "modules");
    if (existsSync(join(candidate, "_core"))) return true;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }

  return false;
}
