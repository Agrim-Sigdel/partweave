import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { intro, note, outro } from "@clack/prompts";
import pc from "picocolors";
import { buildContext, findMissingAnchors, selectedTargets } from "../compose.js";
import { hasCommand, jsPmInstallPlan, pyPmInstallPlan } from "../pm.js";
import { ensureJsPm, ensurePyPm } from "../preflight.js";
import { readProjectManifest, type ProjectManifest } from "../projectmanifest.js";
import { Registry } from "../registry.js";

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
 * Verify every `<partweave:...>` anchor the installed components rely on still
 * exists in the project — the files are user-owned after generation, and a
 * deleted anchor would make a later `partweave add` abort. Report rows for the
 * doctor note; never throws (a broken registry shouldn't break `doctor`).
 */
function anchorReport(dir: string, project: ProjectManifest): string[] {
  if (project.modules.length === 0) {
    return [`${pc.green("✓")} no components installed — nothing to verify`];
  }
  try {
    const registry = new Registry();
    const modules = project.modules.map((id) => registry.require(id));
    const targets = selectedTargets(
      buildContext({
        projectName: project.name,
        outDir: dir,
        apps: project.apps,
        modules: project.modules,
        jsPm: project.jsPm,
        pyPm: project.pyPm,
      }),
    );
    const missing = findMissingAnchors(dir, targets, modules);
    if (missing.length === 0) {
      return [
        `${pc.green("✓")} all wiring anchors intact (${project.modules.length} component(s) checked)`,
      ];
    }
    return [
      ...missing.map(
        (m) => `${pc.red("✗")} ${m.module} → ${m.target}: <partweave:${m.anchor}> missing`,
      ),
      pc.dim("Restore the anchor comments before running `partweave add` — a missing"),
      pc.dim("anchor makes future component wiring abort."),
    ];
  } catch (err) {
    return [`${pc.yellow("○")} couldn't verify wiring anchors: ${(err as Error).message}`];
  }
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

  if (project) {
    note(anchorReport(dir, project).join("\n"), "Wiring anchors");
  }

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
