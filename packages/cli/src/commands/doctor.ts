import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { intro, note, outro } from "@clack/prompts";
import pc from "picocolors";
import { hasCommand, jsPmInstallPlan, pyPmInstallPlan } from "../pm.js";
import { ensureJsPm, ensurePyPm } from "../preflight.js";
import { readProjectManifest } from "../projectmanifest.js";

export interface DoctorFlags {
  dir?: string;
}

/** First line of `<cmd> --version`, or null if the command isn't installed. */
function version(cmd: string): string | null {
  const r = spawnSync(cmd, ["--version"], { encoding: "utf8" });
  if (r.error || r.status !== 0) return null;
  return (r.stdout || r.stderr || "").trim().split("\n")[0] ?? "";
}

/**
 * `partweave doctor` — check that the tools a project needs are installed and
 * offer to install any missing package managers. Run inside a generated project
 * (reads `.partweave/manifest.json`) to check its specific pnpm/uv, or anywhere
 * for a general environment report.
 */
export async function runDoctor(flags: DoctorFlags): Promise<void> {
  intro(pc.bgCyan(pc.black(" partweave ")) + pc.dim(" doctor"));
  const dir = resolve(flags.dir ?? process.cwd());
  const project = readProjectManifest(dir);

  const rows: string[] = [];
  const check = (label: string, cmd: string, optional = false): boolean => {
    const v = version(cmd);
    const ok = v !== null;
    const mark = ok ? pc.green("✓") : optional ? pc.yellow("○") : pc.red("✗");
    const detail = ok ? pc.dim(v) : pc.dim(optional ? "not found (optional)" : "not found");
    rows.push(`${mark} ${label.padEnd(9)} ${detail}`);
    return ok;
  };

  check("node", "node");
  check("npm", "npm");
  check("pnpm", "pnpm", true);
  check("uv", "uv", true);
  check("python", process.platform === "win32" ? "python" : "python3", true);
  check("docker", "docker", true);
  check("make", "make", true);
  note(rows.join("\n"), project ? `Environment for ${project.name}` : "Environment");

  // Offer to install the package managers this project (or the defaults) prefers.
  const jsPm = project?.jsPm ?? "pnpm";
  const pyPm = project?.pyPm ?? "uv";
  if (jsPmInstallPlan(jsPm) && !hasCommand(jsPm)) {
    await ensureJsPm(jsPm, { interactive: true });
  }
  if (pyPmInstallPlan(pyPm) && !hasCommand(pyPm)) {
    await ensurePyPm(pyPm, { interactive: true });
  }

  outro(pc.green("Done."));
}
