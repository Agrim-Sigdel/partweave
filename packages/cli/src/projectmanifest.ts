import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PartweaveError } from "./errors.js";
import { writeFileEnsured } from "./fsutil.js";
import type { JsPm, PyPm } from "./pm.js";
import type { AppName } from "./types.js";

/**
 * A small record written into every generated project (`.partweave/manifest.json`)
 * so `partweave add` knows what apps and components are already installed —
 * and which package managers the project uses, so later `add`s stay consistent.
 */
export interface ProjectManifest {
  name: string;
  apps: AppName[];
  modules: string[];
  /** JS/TS package manager (defaults to pnpm for projects generated before this existed) */
  jsPm?: JsPm;
  /** Python package manager (defaults to uv for older projects) */
  pyPm?: PyPm;
}

const REL = ".partweave/manifest.json";

/**
 * Read a project's manifest. Returns `null` only when the file is genuinely
 * **absent** (not a generated project); a file that exists but can't be read or
 * parsed throws a clear error rather than masquerading as "no project" (F32), so
 * a corrupt/hand-edited manifest isn't misreported as an un-scaffolded dir.
 */
export function readProjectManifest(dir: string): ProjectManifest | null {
  const p = join(dir, REL);
  if (!existsSync(p)) return null;
  let raw: string;
  try {
    raw = readFileSync(p, "utf8");
  } catch (err) {
    throw new PartweaveError(
      "not-a-project",
      `Couldn't read ${REL} at ${dir}: ${(err as Error).message}`,
      { dir },
    );
  }
  try {
    return JSON.parse(raw) as ProjectManifest;
  } catch {
    throw new PartweaveError(
      "not-a-project",
      `${REL} at ${dir} exists but isn't valid JSON (corrupt or hand-edited). Fix or remove it.`,
      { dir, corrupt: true },
    );
  }
}

export function writeProjectManifest(dir: string, pm: ProjectManifest): void {
  writeFileEnsured(join(dir, REL), JSON.stringify(pm, null, 2) + "\n");
}
