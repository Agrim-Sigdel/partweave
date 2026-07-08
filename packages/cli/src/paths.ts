import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

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
  throw new Error(
    "Could not locate the modules/ catalog. Set PARTWEAVE_MODULES_DIR to point at it.",
  );
}
