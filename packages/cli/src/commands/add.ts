import { resolve } from "node:path";
import { intro, log, note, outro, spinner } from "@clack/prompts";
import pc from "picocolors";
import { buildContext, compose, selectedTargets } from "../compose.js";
import {
  readProjectManifest,
  writeProjectManifest,
  type ProjectManifest,
} from "../projectmanifest.js";
import { Registry } from "../registry.js";
import { resolveModules, validateApps } from "../resolve.js";
import { APPS, type AppName, type Selection, type TargetName } from "../types.js";

export interface AddFlags {
  dir?: string;
}

const isApp = (id: string): id is AppName =>
  (APPS as readonly string[]).includes(id);

const sel = (pm: ProjectManifest, dir: string, apps: AppName[]): Selection => ({
  projectName: pm.name,
  outDir: dir,
  apps,
  modules: pm.modules,
  jsPm: pm.jsPm,
  pyPm: pm.pyPm,
});

/**
 * `partweave add <server|web|mobile|component...>` — grow an existing project.
 * Apps scaffold a new sub-project (and pull in the app-side of installed
 * components); components wire a new feature into the current apps.
 */
export async function runAdd(ids: string[], flags: AddFlags): Promise<void> {
  intro(pc.bgCyan(pc.black(" partweave ")) + pc.dim(" add"));
  const dir = resolve(flags.dir ?? process.cwd());

  const pm = readProjectManifest(dir);
  if (!pm) {
    log.error(
      `No partweave project found at ${dir} (missing .partweave/manifest.json). ` +
        `Run this from inside a generated project, or pass --dir.`,
    );
    process.exit(1);
  }
  if (ids.length === 0) {
    log.error(
      "Specify what to add — an app (`server`/`web`/`mobile`) or a component " +
        "(e.g. `partweave add storage`).",
    );
    process.exit(1);
  }

  const registry = new Registry();
  const appIds = ids.filter(isApp);
  const moduleIds = ids.filter((id) => !isApp(id));

  // Apps first, so components added in the same call can rely on them.
  let manifest: ProjectManifest = pm!;
  if (appIds.length) manifest = addApps(registry, dir, manifest, appIds);
  if (moduleIds.length) manifest = addModules(registry, dir, manifest, moduleIds);

  // Cross-platform: `npm run bootstrap` re-installs JS + server deps via the
  // generated runner; follow with a migration when the server changed.
  const reinstall: string[] = ["npm run bootstrap"];
  if (manifest.apps.includes("server")) reinstall.push("npm run migrate");
  note(reinstall.join("\n"), "Sync deps");
  outro(pc.green("Done."));
}

function addApps(
  registry: Registry,
  dir: string,
  pm: ProjectManifest,
  appIds: AppName[],
): ProjectManifest {
  const already = appIds.filter((a) => pm.apps.includes(a));
  const toAdd = appIds.filter((a) => !pm.apps.includes(a));
  if (already.length) log.info(`Already present: ${already.join(", ")}`);
  if (toAdd.length === 0) return pm;

  const newApps = [...pm.apps, ...toAdd];
  const oldTargets = selectedTargets(buildContext(sel(pm, dir, pm.apps)));
  const newTargets = selectedTargets(buildContext(sel(pm, dir, newApps)));
  const scaffold = new Set<TargetName>(
    [...newTargets].filter((t) => !oldTargets.has(t)),
  );

  const s = spinner();
  s.start(`Adding app(s): ${toAdd.join(", ")}`);
  try {
    // Wire ALL installed components into the new targets (e.g. adding `web` to a
    // server+auth project brings in auth's login page + provider).
    compose({
      selection: { ...sel(pm, dir, newApps), modules: pm.modules },
      registry,
      scaffoldTargets: scaffold,
      wireTargets: scaffold,
      rootFiles: "structural",
    });
  } catch (err) {
    s.stop("Failed");
    log.error((err as Error).message);
    process.exit(1);
  }
  s.stop(`Added ${toAdd.join(", ")}`);

  const updated = { ...pm, apps: newApps };
  writeProjectManifest(dir, updated);
  return updated;
}

function addModules(
  registry: Registry,
  dir: string,
  pm: ProjectManifest,
  moduleIds: string[],
): ProjectManifest {
  let resolved;
  try {
    resolved = resolveModules(registry, [...pm.modules, ...moduleIds]);
    validateApps(registry, resolved.modules, pm.apps);
  } catch (err) {
    log.error((err as Error).message);
    process.exit(1);
  }
  const installed = new Set(pm.modules);
  const delta = resolved.modules.filter((id) => !installed.has(id));
  if (delta.length === 0) {
    log.info("Requested component(s) already installed.");
    return pm;
  }
  const extra = delta.filter((id) => !moduleIds.includes(id));
  if (extra.length) log.info(`Also adding required components: ${extra.join(", ")}`);

  const wireTargets = selectedTargets(buildContext(sel(pm, dir, pm.apps)));
  const s = spinner();
  s.start(`Adding ${delta.join(", ")}`);
  let result;
  try {
    result = compose({
      selection: { ...sel(pm, dir, pm.apps), modules: delta },
      registry,
      scaffoldTargets: new Set(),
      wireTargets,
      rootFiles: "none",
    });
  } catch (err) {
    s.stop("Failed");
    log.error((err as Error).message);
    process.exit(1);
  }
  s.stop(`Wired in ${delta.length} component(s)`);
  if (result.notes.length) note(result.notes.join("\n"), "Notes");

  const updated = { ...pm, modules: resolved.modules };
  writeProjectManifest(dir, updated);
  return updated;
}
