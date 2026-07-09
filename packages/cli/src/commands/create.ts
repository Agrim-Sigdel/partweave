import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { confirm, intro, isCancel, log, note, outro, spinner } from "@clack/prompts";
import pc from "picocolors";
import { renderBanner } from "../banner.js";
import { buildContext, compose, selectedTargets } from "../compose.js";
import {
  detectJsPm,
  detectPyPm,
  hasCommand,
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
  git?: boolean; // initialize a git repo + initial commit (--git / --no-git)
}

/** True when `dir` already sits inside a git work tree (so we shouldn't nest a repo). */
function isInsideGitRepo(dir: string): boolean {
  return (
    spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: dir, stdio: "ignore" })
      .status === 0
  );
}

/**
 * Initialize a git repo in `dir` and make the initial commit. `.env` files are
 * gitignored, so real secrets never land in the commit. Returns false (and leaves
 * the repo in place) if the commit couldn't be made — e.g. no git identity is set,
 * in which case we fall back to a neutral author so the first commit still lands.
 */
function initGit(dir: string): boolean {
  if (spawnSync("git", ["init", "-b", "main"], { cwd: dir, stdio: "ignore" }).status !== 0) {
    // Older git without `-b`: init, then rename the default branch.
    spawnSync("git", ["init"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["branch", "-M", "main"], { cwd: dir, stdio: "ignore" });
  }
  spawnSync("git", ["add", "-A"], { cwd: dir, stdio: "ignore" });
  const msg = "Initial commit (scaffolded with partweave)";
  const opts = { cwd: dir, stdio: "ignore" as const };
  if (spawnSync("git", ["commit", "-m", msg], opts).status === 0) return true;
  // Retry with a neutral identity so a machine without user.name/email still commits.
  const id = ["-c", "user.name=partweave", "-c", "user.email=partweave@users.noreply.github.com"];
  return spawnSync("git", [...id, "commit", "-m", msg], opts).status === 0;
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
  console.log("\n" + renderBanner());
  intro(pc.dim("full-stack scaffolder — pick the parts, own the code"));
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

  // Initialize a git repo + initial commit. Off by default in non-interactive
  // runs (matches --install); interactive runs are asked. Skipped when git is
  // missing or the target already lives inside a repo.
  let gitInitialized = false;
  const gitAvailable = hasCommand("git");
  const alreadyRepo = gitAvailable && isInsideGitRepo(choices.outDir);
  let wantGit: boolean;
  if (flags.git !== undefined) {
    wantGit = flags.git;
  } else if (nonInteractive) {
    wantGit = false;
  } else {
    const ans = await confirm({ message: "Initialize a git repository?" });
    wantGit = !isCancel(ans) && ans === true;
  }
  if (wantGit && gitAvailable && !alreadyRepo) {
    gitInitialized = initGit(choices.outDir);
    if (gitInitialized) log.success("Initialized a git repository (branch main, initial commit).");
    else log.warn("Couldn't create the initial git commit — the repo was left uninitialized.");
  } else if (wantGit && !gitAvailable) {
    log.warn("git isn't installed — skipped repository initialization.");
  } else if (wantGit && alreadyRepo) {
    log.info("Target is already inside a git repository — skipped `git init`.");
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
