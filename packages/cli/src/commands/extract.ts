import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { intro, log, outro } from "@clack/prompts";
import pc from "picocolors";
import { buildContext, compose, selectedTargets } from "../compose.js";
import { PartweaveError } from "../errors.js";
import { deriveApps, inferRequires, inferWiring } from "../extract-infer.js";
import { type ProjectManifest, readProjectManifest } from "../projectmanifest.js";
import { Registry } from "../registry.js";
import { resolveModules, validateApps } from "../resolve.js";
import { APPS, type AppName, type Manifest, type TargetName } from "../types.js";

export interface ExtractFlags {
  dir?: string;
  from: string; // Comma-separated paths
}

const isApp = (t: string): t is AppName => (APPS as readonly string[]).includes(t);

/**
 * Map a project-relative source path (e.g. `apps/server/email`) to its target
 * and target-relative destination (`server` + `server/email`).
 */
function classifyPath(p: string): { target: TargetName; rel: string } {
  if (/^apps[/\\]server[/\\]/.test(p)) return { target: "server", rel: p.replace(/^apps[/\\]server[/\\]/, "server/") };
  if (/^apps[/\\]web[/\\]/.test(p)) return { target: "web", rel: p.replace(/^apps[/\\]web[/\\]/, "web/") };
  if (/^apps[/\\]mobile[/\\]/.test(p)) return { target: "mobile", rel: p.replace(/^apps[/\\]mobile[/\\]/, "mobile/") };
  if (/^packages[/\\]shared[/\\]/.test(p)) return { target: "shared", rel: p.replace(/^packages[/\\]shared[/\\]/, "shared/") };
  if (/^packages[/\\]api-client[/\\]/.test(p)) return { target: "api-client", rel: p.replace(/^packages[/\\]api-client[/\\]/, "api-client/") };
  return { target: "root", rel: p };
}

/**
 * Compose the project as it stands WITHOUT the extracted feature into a throwaway
 * temp dir (the feature is a local, hand-added dir absent from `pm.modules`, so a
 * fresh compose of the manifest is exactly "the project minus this feature"). The
 * caller diffs the live project against this reference to recover the wiring.
 */
function composeReference(
  registry: Registry,
  pm: ProjectManifest,
  installed: string[],
): { refDir: string; cleanup: () => void } {
  const resolved = resolveModules(registry, installed);
  const selection = {
    projectName: pm.name,
    outDir: mkdtempSync(join(tmpdir(), "pw-extract-ref-")),
    apps: pm.apps,
    modules: resolved.modules,
    jsPm: pm.jsPm,
    pyPm: pm.pyPm,
  };
  const targets = selectedTargets(buildContext(selection));
  compose({
    selection,
    registry,
    scaffoldTargets: targets,
    wireTargets: targets,
    rootFiles: "all",
  });
  return { refDir: selection.outDir, cleanup: () => rmSync(selection.outDir, { recursive: true, force: true }) };
}

/**
 * Round-trip: assemble a temporary module catalog that includes the freshly
 * emitted module, then compose a throwaway project that selects it. Composition
 * runs the same anchor preflight + injection the real engine uses, so an anchor
 * the inferred wiring references but _core doesn't ship (or an invalid manifest,
 * or an unsatisfiable `requires`) fails here with a typed error — the module is
 * proven to wire cleanly before we tell the user it's ready. Typecheck is run
 * only when the throwaway project has its dependencies installed (never in a bare
 * temp dir), so we don't fail a module for a toolchain we can't exercise offline.
 */
function validateRoundtrip(
  outDir: string,
  manifest: Pick<Manifest, "id" | "targets" | "requiresApps">,
  modulesDir: string,
  pm: Pick<ProjectManifest, "jsPm" | "pyPm">,
): void {
  const tmpMods = mkdtempSync(join(tmpdir(), "pw-extract-cat-"));
  try {
    // Whole-catalog copy so the module's `requires` (real catalog modules) resolve.
    cpSync(modulesDir, tmpMods, { recursive: true });
    const modDest = join(tmpMods, manifest.id);
    rmSync(modDest, { recursive: true, force: true });
    cpSync(outDir, modDest, { recursive: true });

    let registry: Registry;
    try {
      registry = new Registry(tmpMods); // re-parses + validates every module.json
    } catch (err) {
      throw new PartweaveError(
        "internal",
        `Round-trip failed: the emitted module.json is invalid — ${(err as Error).message}`,
      );
    }

    const resolved = resolveModules(registry, [manifest.id]);
    const reqApps = new Set<string>(manifest.requiresApps);
    for (const mid of resolved.modules) {
      for (const a of registry.require(mid).manifest.requiresApps) reqApps.add(a);
    }
    const apps = deriveApps(manifest.targets, [...reqApps]);
    validateApps(registry, resolved.modules, apps);

    const proj = mkdtempSync(join(tmpdir(), "pw-extract-rt-"));
    try {
      const selection = {
        projectName: "pw-roundtrip",
        outDir: proj,
        apps,
        modules: resolved.modules,
        jsPm: pm.jsPm,
        pyPm: pm.pyPm,
      };
      const targets = selectedTargets(buildContext(selection));
      compose({ selection, registry, scaffoldTargets: targets, wireTargets: targets, rootFiles: "all" });

      // Best-effort typecheck: only meaningful with deps installed (never in temp).
      if (existsSync(join(proj, "node_modules"))) {
        const r = spawnSync("node", ["scripts/run.mjs", "typecheck"], { cwd: proj });
        if (r.status) {
          throw new PartweaveError(
            "internal",
            `Round-trip typecheck failed for extracted module "${manifest.id}".`,
          );
        }
      }
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  } catch (err) {
    if (err instanceof PartweaveError) throw err;
    throw new PartweaveError(
      "internal",
      `Extracted module "${manifest.id}" failed round-trip validation: ${(err as Error).message}. ` +
        `The inferred wiring or requires may be incomplete — review .partweave/extracted/${manifest.id}/module.json.`,
    );
  } finally {
    rmSync(tmpMods, { recursive: true, force: true });
  }
}

/**
 * `partweave extract <id> --from <paths...>`
 * Extracts local features from a generated project into a reusable module format,
 * inferring the module's wiring (by diffing anchored files against a feature-free
 * reference compose) and its `requires` (by scanning the extracted imports), then
 * validating the result round-trips cleanly.
 */
export async function runExtract(id: string, flags: ExtractFlags): Promise<void> {
  intro(pc.bgMagenta(pc.black(" partweave ")) + pc.dim(" extract"));

  const dir = resolve(flags.dir ?? process.cwd());
  const pm = readProjectManifest(dir);

  if (!pm) {
    throw new PartweaveError(
      "not-a-project",
      `No partweave project found at ${dir} (missing .partweave/manifest.json). ` +
        `Run this from inside a generated project.`,
      { dir },
    );
  }

  if (!id) {
    throw new PartweaveError("usage", "Specify an id for the new module (e.g., `partweave extract email`).");
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new PartweaveError("usage", `Module id "${id}" must be kebab-case (lowercase letters, digits, hyphens).`, { id });
  }
  if (!flags.from) {
    throw new PartweaveError("usage", "Specify the source paths to extract using --from (e.g., `--from apps/server/email`).");
  }

  const paths = flags.from.split(",").map((p) => p.trim()).filter(Boolean);
  if (paths.length === 0) {
    throw new PartweaveError("usage", "No valid paths provided in --from.");
  }

  const outDir = join(dir, ".partweave", "extracted", id);
  if (existsSync(outDir)) {
    log.warn(`Extraction directory already exists at ${outDir}. Overwriting files...`);
    rmSync(outDir, { recursive: true, force: true });
  }
  mkdirSync(outDir, { recursive: true });

  const targets = new Set<TargetName>();
  for (const p of paths) {
    const srcPath = resolve(dir, p);
    if (!existsSync(srcPath)) {
      throw new PartweaveError("not-found", `Source path does not exist: ${srcPath}`);
    }
    const { target, rel } = classifyPath(p);
    targets.add(target);
    const destPath = join(outDir, rel);
    mkdirSync(dirname(destPath), { recursive: true });
    cpSync(srcPath, destPath, { recursive: true });
    log.info(`Copied ${p} -> ${rel}`);
  }

  // --- inference ---------------------------------------------------------
  const registry = new Registry();
  const installed = pm.modules.filter((m) => registry.has(m));
  const dropped = pm.modules.filter((m) => !registry.has(m));
  if (dropped.length) {
    log.warn(`Ignoring installed modules not in the catalog for the reference compose: ${dropped.join(", ")}.`);
  }

  // 1. Wiring, by diffing the live anchored files against a feature-free reference.
  //    `root` carries no anchor wiring in this system (its files are computed), and
  //    its dest is the project root — scanning it would recurse into every app — so
  //    wiring inference is limited to the real sub-project targets.
  const wiringTargets = [...targets].filter((t) => t !== "root");
  let wiring: ReturnType<typeof inferWiring>;
  const { refDir, cleanup } = composeReference(registry, pm, installed);
  try {
    wiring = inferWiring(dir, refDir, wiringTargets);
  } finally {
    cleanup();
  }

  const wiredAnchors = Object.values(wiring).reduce(
    (n, w) =>
      n +
      (w?.installedApps?.length ?? 0) +
      (w?.urls?.length ?? 0) +
      (w?.settings?.length ?? 0) +
      (w?.providers?.length ?? 0) +
      (w?.routes?.length ?? 0) +
      (w?.deps?.length ?? 0) +
      Object.values(w?.anchors ?? {}).reduce((m, a) => m + a.length, 0),
    0,
  );
  if (wiredAnchors === 0) {
    log.warn(
      "No wiring was inferred — the extracted feature doesn't appear to inject at any anchor, " +
        "or the live project diverges from a clean compose. Review module.json before publishing.",
    );
  } else {
    log.info(`Inferred ${wiredAnchors} wiring line(s) across ${Object.keys(wiring).length} target(s).`);
  }

  // 2. requires + self-containment, from the extracted code's imports.
  const { requires, warnings } = inferRequires(outDir, registry, installed, id);
  if (requires.length) log.info(`Inferred requires: ${requires.join(", ")}.`);
  for (const w of warnings) log.warn(w);

  // --- emit --------------------------------------------------------------
  const requiresApps = [...targets].filter(isApp);
  const manifest: Partial<Manifest> = {
    id,
    title: `${id} (Extracted)`,
    description: `Extracted from local project ${pm.name}`,
    kind: "feature",
    targets: Array.from(targets),
    requiresApps,
    requires,
    wiring,
    notes: [],
  };
  writeFileSync(join(outDir, "module.json"), JSON.stringify(manifest, null, 2) + "\n");
  log.info("Wrote module.json with inferred wiring + requires.");

  // 3. Round-trip: prove the module composes cleanly before declaring success.
  validateRoundtrip(
    outDir,
    { id, targets: Array.from(targets), requiresApps },
    registry.modulesDir,
    pm,
  );
  log.success("Round-trip validation passed — the module composes cleanly.");

  outro(
    pc.green(
      `\nSuccessfully extracted '${id}' to .partweave/extracted/${id}/\n\n` +
        `You can now copy this folder to the central partweave repository (modules/${id}) and open a PR!`,
    ),
  );
}
