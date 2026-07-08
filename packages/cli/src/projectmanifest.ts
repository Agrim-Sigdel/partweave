import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

export function readProjectManifest(dir: string): ProjectManifest | null {
  const p = join(dir, REL);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as ProjectManifest;
  } catch {
    return null;
  }
}

export function writeProjectManifest(dir: string, pm: ProjectManifest): void {
  writeFileEnsured(join(dir, REL), JSON.stringify(pm, null, 2) + "\n");
}
