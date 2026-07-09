import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { confirm, intro, isCancel, log, note, outro, spinner } from "@clack/prompts";
import pc from "picocolors";
import { buildContext, compose, selectedTargets } from "../compose.js";
import {
  detectJsPm,
  detectPyPm,
  JS_PMS,
  PY_PMS,
  type JsPm,
  type PyPm,
} from "../pm.js";
import { ensureJsPm, ensurePyPm } from "../preflight.js";
import { Registry } from "../registry.js";
import { writeProjectManifest } from "../projectmanifest.js";
import { slugify } from "../render.js";
import { resolveModules, validateApps } from "../resolve.js";
import { promptCreate, type RawChoices } from "../prompts.js";
import { APPS, type AppName } from "../types.js";

export interface CreateFlags {
  name?: string;
  dir?: string;
  server?: boolean;
  web?: boolean;
  mobile?: boolean;
  with?: string; // comma-separated module ids
  jsPm?: string; // pnpm | npm
  pyPm?: string; // uv | pip
  yes?: boolean;
  force?: boolean;
  install?: boolean; // run `bootstrap` after scaffolding (--install / --no-install)
}

/** Validate a --js-pm/--py-pm flag, or fall back to what's installed. */
function resolvePm<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  detect: () => T,
  flag: string,
): T {
  if (value === undefined) return detect();
  if ((allowed as readonly string[]).includes(value)) return value as T;
  log.error(`Invalid ${flag} "${value}". Choose one of: ${allowed.join(", ")}.`);
  process.exit(1);
}

function appsFromFlags(flags: CreateFlags): AppName[] | null {
  const explicit = ["server", "web", "mobile"].some(
    (k) => flags[k as keyof CreateFlags] !== undefined,
  );
  if (!explicit) return null;
  const apps = APPS.filter((a) => flags[a] === true);
  // if the user only passed --no-* flags, treat the rest as enabled
  if (apps.length === 0) return APPS.filter((a) => flags[a] !== false);
  return apps;
}

function defaultModules(registry: Registry, apps: AppName[]): string[] {
  const present = new Set<string>(apps);
  if (apps.includes("web") || apps.includes("mobile")) present.add("shared");
  return registry
    .features()
    .filter((m) => m.manifest.default)
    .filter((m) => m.manifest.targets.some((t) => present.has(t)))
    .filter((m) => m.manifest.requiresApps.every((a) => apps.includes(a)))
    .map((m) => m.manifest.id);
}

export async function runCreate(flags: CreateFlags): Promise<void> {
  intro(pc.bgCyan(pc.black(" partweave ")) + pc.dim(" full-stack scaffolder"));
  const registry = new Registry();

  const flagApps = appsFromFlags(flags);
  const nonInteractive = flags.yes === true || flagApps !== null;

  const jsPm: JsPm = resolvePm(flags.jsPm, JS_PMS, detectJsPm, "--js-pm");
  const pyPm: PyPm = resolvePm(flags.pyPm, PY_PMS, detectPyPm, "--py-pm");

  let choices: RawChoices;
  if (nonInteractive) {
    const apps = flagApps ?? [...APPS];
    const name = flags.name ?? "my-app";
    const outDir = resolve(flags.dir ?? `./${slugify(name)}`);
    const modules =
      flags.with !== undefined
        ? flags.with.split(",").map((s) => s.trim()).filter(Boolean)
        : defaultModules(registry, apps);
    choices = { projectName: name, outDir, apps, modules, jsPm, pyPm };
  } else {
    choices = await promptCreate(registry, {
      projectName: flags.name,
      outDir: flags.dir ? resolve(flags.dir) : undefined,
      // pre-select an explicitly-passed --js-pm/--py-pm; otherwise the prompt
      // defaults to whatever is installed.
      jsPm: flags.jsPm ? jsPm : undefined,
      pyPm: flags.pyPm ? pyPm : undefined,
    });
  }

  // guard: don't clobber a non-empty directory
  if (existsSync(choices.outDir) && readdirSync(choices.outDir).length > 0 && !flags.force) {
    log.error(`${choices.outDir} exists and is not empty. Use --force to override.`);
    process.exit(1);
  }

  // Make sure the chosen package managers exist (offer to install, else fall back
  // to npm/pip) so the generated project matches a manager that's actually present.
  const ensureOpts = { interactive: !nonInteractive, install: flags.install };
  if (choices.apps.includes("web") || choices.apps.includes("mobile")) {
    choices.jsPm = await ensureJsPm(choices.jsPm, ensureOpts);
  }
  if (choices.apps.includes("server")) {
    choices.pyPm = await ensurePyPm(choices.pyPm, ensureOpts);
  }

  // resolve module dependencies / conflicts
  let resolved;
  try {
    resolved = resolveModules(registry, choices.modules);
  } catch (err) {
    log.error((err as Error).message);
    process.exit(1);
  }
  if (resolved.autoAdded.length) {
    log.info(`Added required components: ${resolved.autoAdded.join(", ")}`);
  }
  try {
    validateApps(registry, resolved.modules, choices.apps);
  } catch (err) {
    log.error((err as Error).message);
    process.exit(1);
  }

  const s = spinner();
  s.start("Scaffolding");
  let result;
  try {
    const selection = {
      projectName: choices.projectName,
      outDir: choices.outDir,
      apps: choices.apps,
      modules: resolved.modules,
      jsPm: choices.jsPm,
      pyPm: choices.pyPm,
    };
    const targets = selectedTargets(buildContext(selection));
    result = compose({
      selection,
      registry,
      scaffoldTargets: targets,
      wireTargets: targets,
      rootFiles: "all",
    });
  } catch (err) {
    s.stop("Failed");
    log.error((err as Error).message);
    process.exit(1);
  }
  s.stop(`Created ${result.written.length} files`);

  writeProjectManifest(choices.outDir, {
    name: choices.projectName,
    apps: choices.apps,
    modules: resolved.modules,
    jsPm: choices.jsPm,
    pyPm: choices.pyPm,
  });

  // Offer to install dependencies now (interactive) or on --install.
  let installed = false;
  if (nonInteractive) {
    installed = flags.install === true;
  } else {
    const ans = await confirm({ message: "Install dependencies now?" });
    installed = !isCancel(ans) && ans === true;
  }
  if (installed) {
    log.step("Installing dependencies (npm run bootstrap)…");
    const r = spawnSync("node", ["scripts/run.mjs", "bootstrap"], {
      cwd: choices.outDir,
      stdio: "inherit",
    });
    if (r.status) {
      log.warn("bootstrap didn't finish cleanly — run `npm run bootstrap` in the project to retry.");
      installed = false;
    }
  }

  const rel = basename(choices.outDir);
  const hasDocker = resolved.modules.includes("docker");
  const steps = [`cd ${rel}`];
  if (!installed) steps.push("npm run bootstrap");
  if (choices.apps.includes("server")) {
    steps.push(hasDocker ? "npm run db:up && npm run migrate" : "npm run migrate");
    steps.push("npm run server");
  }
  if (choices.apps.includes("web")) steps.push("npm run web");
  if (choices.apps.includes("mobile")) steps.push("npm run mobile");
  note(
    steps.join("\n") + "\n\n" + pc.dim("These work on macOS, Linux & Windows. On macOS/Linux, `make <task>` works too."),
    "Next steps",
  );

  if (result.notes.length) note(result.notes.join("\n"), "Notes");
  outro(pc.green("Done."));
}
