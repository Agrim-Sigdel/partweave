import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pc from "picocolors";
import {
  buildContext,
  compose,
  selectedTargets,
  skippedTargetsNote,
  type SkippedTarget,
} from "../compose.js";
import { emitError, emitSuccess } from "../output.js";
import { Registry } from "../registry.js";
import { resolveModules, validateApps } from "../resolve.js";
import { APPS, type AppName, type TargetName } from "../types.js";
import { appsFromFlags } from "./create.js";

export interface PlanFlags {
  name?: string;
  server?: boolean;
  web?: boolean;
  mobile?: boolean;
  with?: string;
  json?: boolean;
}

export interface Plan {
  projectName: string;
  apps: AppName[];
  /** resolved + topologically ordered module ids */
  modules: string[];
  /** ids pulled in automatically to satisfy `requires` */
  autoAdded: string[];
  /** sub-projects that would be generated */
  targets: TargetName[];
  /** every file that would be written, relative to the project root, sorted */
  files: string[];
  fileCount: number;
  /** env keys → default value contributed by the selected modules */
  env: Record<string, string>;
  /** post-generation notes */
  notes: string[];
  /** distinct present targets the selected modules contribute to */
  appliedTargets: TargetName[];
  /** module targets declared but absent from this selection (silently unwired) */
  skippedTargets: SkippedTarget[];
}

/**
 * `partweave plan [--json]` — resolve and validate a selection and preview what
 * `create` would produce, **without writing anything** to the target (F25). The
 * preview is exact: it composes into a throwaway temp dir (reusing the real
 * engine so it can't drift) and reports the files, then discards the temp dir.
 */
export async function runPlan(flags: PlanFlags): Promise<void> {
  const json = flags.json === true;
  try {
    const registry = new Registry();
    const apps = appsFromFlags(flags) ?? [...APPS];
    const requested = flags.with
      ? flags.with.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const resolved = resolveModules(registry, requested);
    validateApps(registry, resolved.modules, apps);

    const projectName = flags.name ?? "my-app";
    const selection = { projectName, outDir: "", apps, modules: resolved.modules };
    const targets = [...selectedTargets(buildContext(selection))];

    // Compose into a discarded temp dir so the file list is exactly what create
    // would write — no separate, drift-prone enumeration.
    const tmp = mkdtempSync(join(tmpdir(), "pw-plan-"));
    let result;
    try {
      result = compose({
        selection: { ...selection, outDir: tmp },
        registry,
        scaffoldTargets: new Set(targets),
        wireTargets: new Set(targets),
        rootFiles: "all",
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }

    const env: Record<string, string> = {};
    for (const id of resolved.modules) {
      Object.assign(env, registry.require(id).manifest.env);
    }

    const plan: Plan = {
      projectName,
      apps,
      modules: resolved.modules,
      autoAdded: resolved.autoAdded,
      targets,
      files: [...result.written].sort(),
      fileCount: result.written.length,
      env,
      notes: result.notes,
      appliedTargets: result.appliedTargets,
      skippedTargets: result.skippedTargets,
    };

    emitSuccess("plan", json, plan, () => {
      console.log(pc.bold(`\nPlan for ${pc.cyan(projectName)}`) + pc.dim("  (nothing written)"));
      console.log(`  apps       ${plan.apps.join(", ")}`);
      console.log(`  components ${plan.modules.length ? plan.modules.join(", ") : pc.dim("none")}`);
      if (plan.autoAdded.length) console.log(pc.dim(`             (auto-added: ${plan.autoAdded.join(", ")})`));
      console.log(`  targets    ${plan.targets.join(", ")}`);
      console.log(`  files      ${plan.fileCount}`);
      const envKeys = Object.keys(plan.env);
      if (envKeys.length) console.log(`  env        ${envKeys.join(", ")}`);
      if (plan.notes.length) console.log(pc.dim("\n" + plan.notes.join("\n")));
      const skipped = skippedTargetsNote(plan.skippedTargets);
      if (skipped) console.log(pc.dim(`  ${skipped}`));
      console.log();
    });
  } catch (err) {
    emitError("plan", json, err);
  }
}
