import { existsSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { intro, log, note, outro, spinner } from "@clack/prompts";
import pc from "picocolors";
import { compose } from "../compose.js";
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
  yes?: boolean;
  force?: boolean;
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
  intro(pc.bgCyan(pc.black(" base ")) + pc.dim(" full-stack scaffolder"));
  const registry = new Registry();

  const flagApps = appsFromFlags(flags);
  const nonInteractive = flags.yes === true || flagApps !== null;

  let choices: RawChoices;
  if (nonInteractive) {
    const apps = flagApps ?? [...APPS];
    const name = flags.name ?? "my-app";
    const outDir = resolve(flags.dir ?? `./${slugify(name)}`);
    const modules =
      flags.with !== undefined
        ? flags.with.split(",").map((s) => s.trim()).filter(Boolean)
        : defaultModules(registry, apps);
    choices = { projectName: name, outDir, apps, modules };
  } else {
    choices = await promptCreate(registry, {
      projectName: flags.name,
      outDir: flags.dir ? resolve(flags.dir) : undefined,
    });
  }

  // guard: don't clobber a non-empty directory
  if (existsSync(choices.outDir) && readdirSync(choices.outDir).length > 0 && !flags.force) {
    log.error(`${choices.outDir} exists and is not empty. Use --force to override.`);
    process.exit(1);
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
    result = compose({
      selection: {
        projectName: choices.projectName,
        outDir: choices.outDir,
        apps: choices.apps,
        modules: resolved.modules,
      },
      registry,
      mode: "create",
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
  });

  const rel = basename(choices.outDir);
  const steps = [`cd ${rel}`, "make bootstrap"];
  if (choices.apps.includes("server")) steps.push("make db-up && make migrate", "make server");
  if (choices.apps.includes("web")) steps.push("make web");
  if (choices.apps.includes("mobile")) steps.push("make mobile");
  note(steps.join("\n"), "Next steps");

  if (result.notes.length) note(result.notes.join("\n"), "Notes");
  outro(pc.green("Done."));
}
