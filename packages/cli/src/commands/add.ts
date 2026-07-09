import { resolve } from "node:path";
import { intro, log, note, outro, spinner } from "@clack/prompts";
import pc from "picocolors";
import { buildContext, compose, selectedTargets } from "../compose.js";
import { PartweaveError } from "../errors.js";
import { emitError, emitSuccess } from "../output.js";
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
  json?: boolean;
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

/** What a single `add` run changed — surfaced in the JSON envelope. */
interface AddOutcome {
  addedApps: AppName[];
  addedModules: string[];
  notes: string[];
}

/**
 * `partweave add <server|web|mobile|component...>` — grow an existing project.
 * Apps scaffold a new sub-project (and pull in the app-side of installed
 * components); components wire a new feature into the current apps.
 */
export async function runAdd(ids: string[], flags: AddFlags): Promise<void> {
  const json = flags.json === true;
  try {
    await addInner(ids, flags, json);
  } catch (err) {
    emitError("add", json, err);
  }
}

async function addInner(ids: string[], flags: AddFlags, json: boolean): Promise<void> {
  if (!json) intro(pc.bgCyan(pc.black(" partweave ")) + pc.dim(" add"));
  const dir = resolve(flags.dir ?? process.cwd());

  const pm = readProjectManifest(dir);
  if (!pm) {
    throw new PartweaveError(
      "not-a-project",
      `No partweave project found at ${dir} (missing .partweave/manifest.json). ` +
        `Run this from inside a generated project, or pass --dir.`,
      { dir },
    );
  }
  if (ids.length === 0) {
    throw new PartweaveError(
      "usage",
      "Specify what to add — an app (`server`/`web`/`mobile`) or a component " +
        "(e.g. `partweave add storage`).",
    );
  }

  const registry = new Registry();
  const appIds = ids.filter(isApp);
  const moduleIds = ids.filter((id) => !isApp(id));

  const outcome: AddOutcome = { addedApps: [], addedModules: [], notes: [] };

  // Apps first, so components added in the same call can rely on them.
  let manifest: ProjectManifest = pm;
  if (appIds.length) manifest = addApps(registry, dir, manifest, appIds, json, outcome);
  if (moduleIds.length) manifest = addModules(registry, dir, manifest, moduleIds, json, outcome);

  emitSuccess(
    "add",
    json,
    {
      dir,
      addedApps: outcome.addedApps,
      addedModules: outcome.addedModules,
      apps: manifest.apps,
      modules: manifest.modules,
      notes: outcome.notes,
    },
    () => {
      // Cross-platform: `npm run bootstrap` re-installs JS + server deps via the
      // generated runner; follow with a migration when the server changed.
      const reinstall: string[] = ["npm run bootstrap"];
      if (manifest.apps.includes("server")) reinstall.push("npm run migrate");
      note(reinstall.join("\n"), "Sync deps");
      outro(pc.green("Done."));
    },
  );
}

function addApps(
  registry: Registry,
  dir: string,
  pm: ProjectManifest,
  appIds: AppName[],
  json: boolean,
  outcome: AddOutcome,
): ProjectManifest {
  const already = appIds.filter((a) => pm.apps.includes(a));
  const toAdd = appIds.filter((a) => !pm.apps.includes(a));
  if (already.length && !json) log.info(`Already present: ${already.join(", ")}`);
  if (toAdd.length === 0) return pm;

  const newApps = [...pm.apps, ...toAdd];
  const oldTargets = selectedTargets(buildContext(sel(pm, dir, pm.apps)));
  const newTargets = selectedTargets(buildContext(sel(pm, dir, newApps)));
  const scaffold = new Set<TargetName>(
    [...newTargets].filter((t) => !oldTargets.has(t)),
  );

  const s = json ? null : spinner();
  s?.start(`Adding app(s): ${toAdd.join(", ")}`);
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
    s?.stop("Failed");
    throw err;
  }
  s?.stop(`Added ${toAdd.join(", ")}`);

  outcome.addedApps.push(...toAdd);
  const updated = { ...pm, apps: newApps };
  writeProjectManifest(dir, updated);
  return updated;
}

function addModules(
  registry: Registry,
  dir: string,
  pm: ProjectManifest,
  moduleIds: string[],
  json: boolean,
  outcome: AddOutcome,
): ProjectManifest {
  const resolved = resolveModules(registry, [...pm.modules, ...moduleIds]);
  validateApps(registry, resolved.modules, pm.apps);
  const installed = new Set(pm.modules);
  const delta = resolved.modules.filter((id) => !installed.has(id));
  if (delta.length === 0) {
    if (!json) log.info("Requested component(s) already installed.");
    return pm;
  }
  const extra = delta.filter((id) => !moduleIds.includes(id));
  if (extra.length && !json) log.info(`Also adding required components: ${extra.join(", ")}`);

  const wireTargets = selectedTargets(buildContext(sel(pm, dir, pm.apps)));
  const s = json ? null : spinner();
  s?.start(`Adding ${delta.join(", ")}`);
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
    s?.stop("Failed");
    throw err;
  }
  s?.stop(`Wired in ${delta.length} component(s)`);
  if (result.notes.length && !json) note(result.notes.join("\n"), "Notes");

  outcome.addedModules.push(...delta);
  outcome.notes.push(...result.notes);
  const updated = { ...pm, modules: resolved.modules };
  writeProjectManifest(dir, updated);
  return updated;
}
