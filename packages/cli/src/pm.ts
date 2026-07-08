import { spawnSync } from "node:child_process";

/**
 * Package-manager abstraction. Generated projects can use pnpm or npm for the
 * JS/TS workspace, and uv or pip for the Django server — this module maps a
 * chosen manager to the exact commands, so the Makefile / CI / package.json the
 * generator emits speak whichever tool the user actually has installed.
 */

export const JS_PMS = ["pnpm", "npm"] as const;
export type JsPm = (typeof JS_PMS)[number];

export const PY_PMS = ["uv", "pip"] as const;
export type PyPm = (typeof PY_PMS)[number];

export const DEFAULT_JS_PM: JsPm = "pnpm";
export const DEFAULT_PY_PM: PyPm = "uv";

export interface JsPmProfile {
  name: JsPm;
  /** install every workspace's dependencies */
  install: string;
  /** run a package.json script in one workspace member (by its package name) */
  run(pkg: string, script: string): string;
  /** run a script in every workspace that defines it */
  runAll(script: string): string;
  /** value for package.json "packageManager", or null to omit the field */
  packageManagerField: string | null;
  /** pnpm declares members in pnpm-workspace.yaml; npm uses "workspaces" in package.json */
  usesWorkspaceYaml: boolean;
  /** pnpm's symlinked store breaks Expo, so a mobile project needs a hoisted .npmrc; npm is already flat */
  needsHoistNpmrc: boolean;
}

const PNPM_VERSION = "pnpm@10.20.0";

export function jsPmProfile(name: JsPm): JsPmProfile {
  if (name === "npm") {
    return {
      name,
      install: "npm install",
      run: (pkg, script) => `npm run ${script} -w ${pkg}`,
      runAll: (script) => `npm run ${script} --workspaces --if-present`,
      packageManagerField: null,
      usesWorkspaceYaml: false,
      needsHoistNpmrc: false,
    };
  }
  return {
    name: "pnpm",
    install: "pnpm install",
    run: (pkg, script) => `pnpm --filter ${pkg} ${script}`,
    runAll: (script) => `pnpm -r ${script}`,
    packageManagerField: PNPM_VERSION,
    usesWorkspaceYaml: true,
    needsHoistNpmrc: true,
  };
}

export interface PyPmProfile {
  name: PyPm;
  /**
   * Commands (already `&&`-joined) to create/refresh the server's environment
   * from pyproject.toml, run *inside* apps/server. Used by `make bootstrap`,
   * CI, and `partweave add`.
   */
  syncInServer: string;
  /** run a console command (e.g. "python manage.py migrate") inside the server env */
  run(cmd: string): string;
  /** pip needs a generated helper to install deps from pyproject; uv reads it natively */
  needsSyncScript: boolean;
}

/** Create/refresh a local .venv from pyproject and install its deps (pip path). */
const PIP_SYNC =
  "python3 -m venv .venv && .venv/bin/python -m pip install -U pip && " +
  ".venv/bin/python scripts/sync_deps.py";

export function pyPmProfile(name: PyPm): PyPmProfile {
  if (name === "pip") {
    return {
      name,
      syncInServer: PIP_SYNC,
      run: (cmd) => `.venv/bin/${cmd}`,
      needsSyncScript: true,
    };
  }
  return {
    name: "uv",
    syncInServer: "uv sync",
    run: (cmd) => `uv run ${cmd}`,
    needsSyncScript: false,
  };
}

/** Is a command available on PATH? Used to pick sensible PM defaults. */
export function hasCommand(cmd: string): boolean {
  try {
    const probe =
      process.platform === "win32"
        ? spawnSync("where", [cmd], { stdio: "ignore" })
        : spawnSync("sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" });
    return probe.status === 0;
  } catch {
    return false;
  }
}

/** Prefer pnpm/uv when installed, else fall back to the universally-available npm/pip. */
export function detectJsPm(): JsPm {
  return hasCommand("pnpm") ? "pnpm" : "npm";
}
export function detectPyPm(): PyPm {
  return hasCommand("uv") ? "uv" : "pip";
}
