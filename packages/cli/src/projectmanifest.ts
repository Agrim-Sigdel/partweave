import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileEnsured } from "./fsutil.js";
import type { AppName } from "./types.js";

/**
 * A small record written into every generated project (`.quick-build/manifest.json`)
 * so `quick-build add` knows what apps and components are already installed.
 */
export interface ProjectManifest {
  name: string;
  apps: AppName[];
  modules: string[];
}

const REL = ".quick-build/manifest.json";

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
