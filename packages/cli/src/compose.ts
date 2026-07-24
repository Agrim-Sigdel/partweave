import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PartweaveError } from "./errors.js";
import {
  injectAtAnchor,
  mergePackageJsonDeps,
  normalizeWorkspaceDeps,
  pyDepName,
} from "./inject.js";
import { copyTree, readIfExists, writeFileEnsured } from "./fsutil.js";
import { DEFAULT_JS_PM, DEFAULT_PY_PM, jsPmProfile } from "./pm.js";
import type { Registry } from "./registry.js";
import { isBinaryPath, slugify } from "./render.js";
import {
  buildAgentsGuide,
  buildEnvFiles,
  buildCiWorkflows,
  buildMakefile,
  buildPipSyncScript,
  buildJsWorkspace,
  buildReadme,
  buildRootPackageJson,
  buildServerDockerfile,
  buildTaskRunner,
  buildTsconfigBase,
  buildTurboJson,
} from "./rootgen.js";
import {
  type AppName,
  CONVENIENCE_ANCHORS,
  type Module,
  type RenderContext,
  type Selection,
  TARGET_DEST,
  type TargetName,
  type WiringForTarget,
} from "./types.js";

/** Which computed root files to (re)write. */
export type RootFilesMode = "all" | "structural" | "none";

export interface ComposeOptions {
  selection: Selection;
  registry: Registry;
  /** copy the bare _core scaffold for these targets (new apps) */
  scaffoldTargets: Set<TargetName>;
  /** copy module files + apply wiring for these targets */
  wireTargets: Set<TargetName>;
  /** which computed root files to (re)write: all (create), structural (add-app), none (add-module) */
  rootFiles: RootFilesMode;
  /**
   * The app set *before* this run (add-app only). Structural root files are
   * regenerated for the new app set, but a file the user hand-edited since the
   * last generation is preserved instead of clobbered (F4): we detect edits by
   * comparing the on-disk file to what we would have generated for `previousApps`.
   */
  previousApps?: AppName[];
  /**
   * The FULL set of module ids that will be installed after this run, used only
   * to decide which `enhances` soft-joins are active. Defaults to
   * `selection.modules`. On `add-module`, `selection.modules` is just the delta
   * being wired, so the caller passes the complete resolved set here — otherwise
   * an enhancement contributed by an already-installed module would be missed
   * when its counterpart capability arrives.
   */
  contextModuleIds?: string[];
}

/** A target a module declares but that isn't present in the project this run. */
export interface SkippedTarget {
  module: string;
  target: TargetName;
}

export interface ComposeResult {
  written: string[];
  notes: string[];
  /**
   * Distinct targets that at least one selected module actually contributes to,
   * because the target is present in the project (in COPY_ORDER order).
   */
  appliedTargets: TargetName[];
  /**
   * Per-module targets a module declares in its manifest but that aren't present
   * in the project — so that slice of the module was silently not wired. Purely
   * informational: modules are still applied to whichever targets DO exist.
   */
  skippedTargets: SkippedTarget[];
}

/** Targets that correspond to a user-facing app toggle (server/web/mobile). */
const APP_TARGETS = new Set<TargetName>(["server", "web", "mobile"]);

/**
 * A one-line, human-readable summary of the targets a run skipped, e.g.
 * `skipped: mobile (app not present)`. Deduplicated by target. Returns null when
 * nothing was skipped.
 */
export function skippedTargetsNote(skipped: SkippedTarget[]): string | null {
  if (skipped.length === 0) return null;
  const seen = new Set<TargetName>();
  const parts: string[] = [];
  for (const s of skipped) {
    if (seen.has(s.target)) continue;
    seen.add(s.target);
    parts.push(`${s.target} ${APP_TARGETS.has(s.target) ? "(app not present)" : "(not present)"}`);
  }
  return `skipped: ${parts.join(", ")}`;
}

/**
 * Partition each selected module's declared targets into those present in the
 * project (applied) and those absent (skipped). Placement in `compose` is a
 * best-effort intersection with the present targets — a module that targets
 * [server, web, mobile] in a web-only project silently drops its server & mobile
 * slices. This makes that observable without changing the placement behavior.
 */
function partitionTargets(
  modules: Module[],
  presentTargets: Set<TargetName>,
): { appliedTargets: TargetName[]; skippedTargets: SkippedTarget[] } {
  const applied = new Set<TargetName>();
  const skippedTargets: SkippedTarget[] = [];
  for (const mod of modules) {
    for (const t of mod.manifest.targets) {
      if (presentTargets.has(t)) applied.add(t);
      else skippedTargets.push({ module: mod.manifest.id, target: t });
    }
  }
  return { appliedTargets: COPY_ORDER.filter((t) => applied.has(t)), skippedTargets };
}

export function buildContext(selection: Selection): RenderContext {
  const hasServer = selection.apps.includes("server");
  const hasWeb = selection.apps.includes("web");
  const hasMobile = selection.apps.includes("mobile");
  const hasShared = hasWeb || hasMobile;
  const hasApiClient = hasServer && (hasWeb || hasMobile);
  return {
    projectName: selection.projectName,
    projectSlug: slugify(selection.projectName),
    description: `${selection.projectName} — generated with partweave.`,
    apps: selection.apps,
    hasServer,
    hasWeb,
    hasMobile,
    hasShared,
    hasApiClient,
    jsPm: selection.jsPm ?? DEFAULT_JS_PM,
    pyPm: selection.pyPm ?? DEFAULT_PY_PM,
  };
}

export function selectedTargets(ctx: RenderContext): Set<TargetName> {
  const t = new Set<TargetName>(["root"]);
  if (ctx.hasServer) t.add("server");
  if (ctx.hasWeb) t.add("web");
  if (ctx.hasMobile) t.add("mobile");
  if (ctx.hasShared) t.add("shared");
  if (ctx.hasApiClient) t.add("api-client");
  return t;
}

const COPY_ORDER: TargetName[] = [
  "root",
  "server",
  "web",
  "mobile",
  "shared",
  "api-client",
];

/**
 * Installed/derived directories that can never contain our anchors. `add` and
 * `doctor` scan a live user project — without this, the walk crawls
 * node_modules and virtualenvs.
 */
const ANCHOR_SCAN_IGNORE = new Set([
  "node_modules",
  ".git",
  ".venv",
  "venv",
  "__pycache__",
  ".next",
  ".expo",
  ".turbo",
  "dist",
  "build",
]);

/** Scan a directory tree for `<partweave:id>` anchors → the files that contain them. */
function buildAnchorIndex(dir: string): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const re = /<partweave:([\w-]+)>/g;
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      if (ANCHOR_SCAN_IGNORE.has(name)) continue;
      const abs = join(d, name);
      if (statSync(abs).isDirectory()) {
        walk(abs);
        continue;
      }
      if (isBinaryPath(abs)) continue;
      const content = readFileSync(abs, "utf8");
      let m: RegExpExecArray | null;
      while ((m = re.exec(content))) {
        const id = m[1];
        const arr = index.get(id) ?? [];
        if (!arr.includes(abs)) arr.push(abs);
        index.set(id, arr);
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  return index;
}

/** Collect every anchor→lines injection a module contributes to one target. */
function anchorInjections(w: WiringForTarget): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const push = (anchor: string, lines: string[] | undefined) => {
    if (!lines?.length) return;
    out[anchor] = [...(out[anchor] ?? []), ...lines];
  };
  for (const [field, anchor] of Object.entries(CONVENIENCE_ANCHORS)) {
    push(anchor, (w as Record<string, string[] | undefined>)[field]);
  }
  if (w.anchors) for (const [a, lines] of Object.entries(w.anchors)) push(a, lines);
  return out;
}

function injectIntoFiles(
  index: Map<string, string[]>,
  anchorId: string,
  lines: string[],
  targetLabel: string,
): void {
  const files = index.get(anchorId);
  if (!files || files.length === 0) {
    throw new Error(
      `Wiring error: anchor <partweave:${anchorId}> not found in ${targetLabel}. ` +
        `Add the anchor to the _core/${targetLabel} scaffold.`,
    );
  }
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const { content: next } = injectAtAnchor(content, anchorId, lines);
    writeFileSync(file, next);
  }
}

/**
 * Merge Python runtime deps into pyproject's `<partweave:deps>` anchor, keyed by
 * distribution name: a package already declared (in `[project].dependencies`,
 * whether from _core or a previously-wired component) is skipped rather than
 * appended a second time with a possibly-different version spec.
 */
function injectPyDeps(
  index: Map<string, string[]>,
  deps: string[],
  targetLabel: string,
): void {
  const files = index.get("deps");
  if (!files || files.length === 0) {
    throw new Error(
      `Wiring error: anchor <partweave:deps> not found in ${targetLabel}. ` +
        `Add the anchor to the _core/${targetLabel} scaffold.`,
    );
  }
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    // Scope existing-name extraction to the [project].dependencies array so we
    // don't pick up the project name, version, or dependency-group entries.
    const region = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? content;
    const present = new Set(
      [...region.matchAll(/["']([^"']+)["']/g)].map((m) => pyDepName(m[1])),
    );
    const fresh = deps.filter((d) => !present.has(pyDepName(d)));
    if (fresh.length === 0) continue;
    const { content: next } = injectAtAnchor(content, "deps", fresh.map((d) => `"${d}",`));
    writeFileSync(file, next);
  }
}

/** An anchor a module's wiring needs that is absent from the target tree. */
export interface MissingAnchor {
  module: string;
  target: TargetName;
  anchor: string;
  /** the lines that would have been injected at the anchor */
  lines: string[];
}

function buildIndexes(
  outDir: string,
  targets: Set<TargetName>,
): Map<TargetName, Map<string, string[]>> {
  const indexes = new Map<TargetName, Map<string, string[]>>();
  for (const t of targets) {
    indexes.set(t, buildAnchorIndex(join(outDir, TARGET_DEST[t])));
  }
  return indexes;
}

/**
 * One unit of wiring to apply: a `WiringForTarget` bound to a target, with a
 * `source` label for error messages. Both a module's own `wiring` (base units)
 * and active `enhances` blocks (enhancement units) reduce to this shape, so the
 * preflight and injection logic handle them identically.
 */
interface WiringUnit {
  source: string;
  target: TargetName;
  wiring: WiringForTarget;
}

/** A module's own per-target wiring. */
function baseUnits(modules: Module[]): WiringUnit[] {
  const units: WiringUnit[] = [];
  for (const mod of modules) {
    for (const t of mod.manifest.targets) {
      const wiring = mod.manifest.wiring[t];
      if (wiring) units.push({ source: mod.manifest.id, target: t, wiring });
    }
  }
  return units;
}

/**
 * Active soft-join wiring: a module's `enhances[cap]` blocks, included ONLY when
 * some OTHER present module provides `cap`. Order-independent — the result is a
 * pure function of the module *set*, so `create --with a,b`, `create a`+`add b`,
 * and `create b`+`add a` produce the same enhancement units.
 */
function enhancementUnits(contextModules: Module[]): WiringUnit[] {
  const units: WiringUnit[] = [];
  for (const mod of contextModules) {
    for (const [cap, perTarget] of Object.entries(mod.manifest.enhances)) {
      const providedByOther = contextModules.some(
        (o) => o.manifest.provides === cap && o.manifest.id !== mod.manifest.id,
      );
      if (!providedByOther) continue;
      for (const [t, wiring] of Object.entries(perTarget)) {
        if (!wiring) continue;
        units.push({ source: `${mod.manifest.id} (enhances ${cap})`, target: t as TargetName, wiring });
      }
    }
  }
  return units;
}

function collectMissingUnits(
  indexes: Map<TargetName, Map<string, string[]>>,
  targets: Set<TargetName>,
  units: WiringUnit[],
): MissingAnchor[] {
  const missing: MissingAnchor[] = [];
  for (const u of units) {
    if (!targets.has(u.target)) continue;
    const index = indexes.get(u.target)!;
    for (const [anchor, lines] of Object.entries(anchorInjections(u.wiring))) {
      if (!index.get(anchor)?.length) {
        missing.push({ module: u.source, target: u.target, anchor, lines });
      }
    }
    // python deps are injected at <partweave:deps> in pyproject.toml
    if (u.target === "server" && u.wiring.deps?.length && !index.get("deps")?.length) {
      missing.push({
        module: u.source,
        target: u.target,
        anchor: "deps",
        lines: u.wiring.deps.map((d) => `"${d}",`),
      });
    }
  }
  return missing;
}

/**
 * Every `<partweave:...>` anchor the given modules' wiring needs (base wiring
 * plus any active enhancements among them) that is absent from the project at
 * `outDir`. Used by `doctor` to verify a user project hasn't lost its anchors.
 * Pass the FULL installed module set so cross-module enhancements are checked.
 */
export function findMissingAnchors(
  outDir: string,
  targets: Set<TargetName>,
  modules: Module[],
): MissingAnchor[] {
  const units = [...baseUnits(modules), ...enhancementUnits(modules)];
  return collectMissingUnits(buildIndexes(outDir, targets), targets, units);
}

function missingAnchorError(missing: MissingAnchor[]): PartweaveError {
  const blocks = missing.map(
    (m) =>
      `  ${m.module} → ${m.target}: <partweave:${m.anchor}> not found` +
      (m.lines.length ? `\n${m.lines.map((l) => `      ${l}`).join("\n")}` : ""),
  );
  return new PartweaveError(
    "missing-anchor",
    `${missing.length} wiring anchor(s) are missing — nothing was changed.\n` +
      `${blocks.join("\n")}\n` +
      `Restore each anchor comment (e.g. \`# <partweave:urls>\`) where the module's ` +
      `lines belong, or add the lines shown above manually and re-run. ` +
      `\`partweave doctor\` verifies anchors. (In a freshly generated project this ` +
      `means the module expects an anchor the _core scaffold doesn't ship.)`,
    { missing },
  );
}

function applyWiring(
  outDir: string,
  targets: Set<TargetName>,
  units: WiringUnit[],
  workspaceRange: string,
): void {
  // one anchor index per present target directory
  const indexes = buildIndexes(outDir, targets);

  // Preflight: verify every anchor this pass needs before modifying any file,
  // so a lost anchor (deleted from a user-owned file) aborts with a complete
  // fix-it list instead of leaving the project partially wired. Pre-existing
  // targets were already checked at the top of compose(); this pass also covers
  // targets scaffolded during this run (a module/_core contract bug).
  const missing = collectMissingUnits(indexes, targets, units);
  if (missing.length > 0) throw missingAnchorError(missing);

  for (const u of units) {
    if (!targets.has(u.target)) continue;
    const index = indexes.get(u.target)!;
    const targetDir = join(outDir, TARGET_DEST[u.target]);

    // anchor-based wiring
    for (const [anchor, lines] of Object.entries(anchorInjections(u.wiring))) {
      injectIntoFiles(index, anchor, lines, u.target);
    }

    // dependency merging
    if (u.wiring.deps?.length) {
      if (u.target === "server") {
        // Python deps → inject into pyproject's <partweave:deps> anchor, keyed
        // by distribution name so a package already present (from _core or
        // another component) is never added a second time with a different
        // version spec.
        injectPyDeps(index, u.wiring.deps, u.target);
      } else {
        const pkgPath = join(targetDir, "package.json");
        if (existsSync(pkgPath)) {
          const merged = mergePackageJsonDeps(
            readFileSync(pkgPath, "utf8"),
            normalizeWorkspaceDeps(u.wiring.deps, workspaceRange),
          );
          writeFileSync(pkgPath, merged);
        }
      }
    }
  }
}

/**
 * Write each app's own env pair: a committed `.env.example` (regenerated each run)
 * and a gitignored `.env` created only when absent — so re-running or `partweave
 * add` never clobbers secrets or edits a user has made in `.env`.
 */
function writeEnvFiles(outDir: string, ctx: RenderContext, modules: Module[]): string[] {
  const written: string[] = [];
  for (const file of buildEnvFiles(ctx, modules)) {
    const exampleRel = join(file.dir, ".env.example");
    writeFileEnsured(join(outDir, exampleRel), file.example);
    written.push(exampleRel);
    const envRel = join(file.dir, ".env");
    if (!existsSync(join(outDir, envRel))) {
      writeFileEnsured(join(outDir, envRel), file.env);
      written.push(envRel);
    }
  }
  return written;
}

/**
 * Derived, selection-dependent monorepo shell files. Each is pure codegen from
 * the render context, so they can be regenerated as the app set grows.
 *
 * On `create` (`baseline` undefined) they're written fresh. On `add` a file the
 * user hand-edited must never be clobbered (F4) — yet workspace-membership files
 * still need updating for the new app. We tell those apart by regenerating what
 * we *would* have produced for the previous app set (`baseline`): if the on-disk
 * file matches that, the user didn't touch it and it's safe to overwrite with the
 * new version; if it differs, the user edited it, so we keep their file and drop
 * the regenerated one beside it as `<file>.partweave-new`. Returns the rel paths
 * of any files preserved this way so the caller can prompt the user to reconcile.
 */
function writeStructuralRootFiles(
  outDir: string,
  ctx: RenderContext,
  modules: Module[],
  baseline: RenderContext | null,
): string[] {
  const hasDocker = modules.some((m) => m.manifest.id === "docker");
  // Each spec builds its file purely from a render context, so we can compute
  // both the new content (from ctx) and the previous content (from baseline).
  const specs: Array<[string, (c: RenderContext) => string | null]> = [
    // pnpm lists workspace members here; npm lists them in package.json below.
    ["pnpm-workspace.yaml", (c) => buildJsWorkspace(c)],
    ["package.json", (c) => buildRootPackageJson(c, hasDocker)],
    ["turbo.json", (c) => buildTurboJson(c)],
    ["tsconfig.base.json", (c) => buildTsconfigBase(c)],
    // pip path: a helper that installs the server's deps from pyproject into .venv.
    ["apps/server/scripts/sync_deps.py", (c) => buildPipSyncScript(c)],
    // The cross-platform task runner every task delegates to (Windows too); the
    // Makefile is a thin Unix wrapper around it.
    ["scripts/run.mjs", (c) => buildTaskRunner(c, hasDocker)],
    ["Makefile", (c) => buildMakefile(c, hasDocker)],
  ];

  const preserved: string[] = [];
  for (const [rel, build] of specs) {
    const next = build(ctx);
    if (next === null) continue; // not applicable to this selection
    const abs = join(outDir, rel);

    if (!baseline) {
      writeFileEnsured(abs, next);
      continue;
    }
    const current = readIfExists(abs);
    if (current === null || current === build(baseline)) {
      // Absent, or untouched since we last generated it → safe to (re)write.
      writeFileEnsured(abs, next);
    } else if (current !== next) {
      // The user edited this file — keep theirs, park the new one for reconcile.
      writeFileEnsured(`${abs}.partweave-new`, next);
      preserved.push(rel);
    }
    // (current === next → already up to date, nothing to do)
  }
  // Per-app env files are written in the env step (writeEnvFiles), which needs the
  // resolved module list to route component keys.
  return preserved;
}

export function compose(opts: ComposeOptions): ComposeResult {
  const { selection, registry, scaffoldTargets, wireTargets, rootFiles } = opts;
  const ctx = buildContext(selection);
  const outDir = selection.outDir;
  const modules = selection.modules.map((id) => registry.require(id));
  // The full installed set drives enhancement activation; defaults to the
  // modules being wired (create/plan), overridden on add-module with the
  // complete resolved set so already-installed enhancers still fire.
  const contextModules = (opts.contextModuleIds ?? selection.modules).map((id) =>
    registry.require(id),
  );
  // All wiring to apply this run: each wired module's own wiring, plus every
  // active soft-join among the full installed set. Both go through the same
  // preflight + injection path.
  const wiringUnits = [...baseUnits(modules), ...enhancementUnits(contextModules)];
  const written: string[] = [];

  // 0. Preflight anchors on targets that already exist on disk (i.e. not being
  // scaffolded this run) BEFORE writing any file, so an `add` into a project
  // that lost an anchor aborts with nothing copied and nothing modified.
  // Freshly scaffolded targets get their anchors from the _core copy in step 1
  // and are re-checked by applyWiring's own preflight.
  const preExisting = new Set([...wireTargets].filter((t) => !scaffoldTargets.has(t)));
  if (preExisting.size > 0) {
    const missing = collectMissingUnits(buildIndexes(outDir, preExisting), preExisting, wiringUnits);
    if (missing.length > 0) throw missingAnchorError(missing);
  }

  // 1. scaffold bare _core for new targets
  for (const t of COPY_ORDER) {
    if (!scaffoldTargets.has(t)) continue;
    const src = join(registry.modulesDir, "_core", t);
    if (existsSync(src)) {
      written.push(...copyTree(src, join(outDir, TARGET_DEST[t]), ctx));
    }
  }

  // 2. computed root files (per-app env files are written in step 5, below).
  // "all" = create (fresh write); "structural" = add-app (preserve hand edits, F4
  // by diffing against what we'd have generated for the previous app set).
  const baseline =
    rootFiles === "structural" && opts.previousApps
      ? buildContext({ ...selection, apps: opts.previousApps })
      : null;
  const preservedRootFiles =
    rootFiles !== "none" ? writeStructuralRootFiles(outDir, ctx, modules, baseline) : [];
  if (rootFiles === "all") {
    writeFileEnsured(join(outDir, "README.md"), buildReadme(ctx, modules));
    writeFileEnsured(join(outDir, "AGENTS.md"), buildAgentsGuide(ctx, modules));
  }

  // 3. module files for the targets being wired
  for (const mod of modules) {
    for (const t of mod.manifest.targets) {
      if (!wireTargets.has(t)) continue;
      const src = join(mod.dir, t);
      if (existsSync(src)) {
        written.push(...copyTree(src, join(outDir, TARGET_DEST[t]), ctx));
      }
    }
  }

  // 4. wiring (restricted to the targets being wired) — base wiring for the
  // modules being wired, plus any active soft-join enhancements.
  applyWiring(outDir, wireTargets, wiringUnits, jsPmProfile(ctx.jsPm).workspaceRange);

  // 5. env — one .env(.example) pair per app, only when root files are in scope
  if (rootFiles !== "none") written.push(...writeEnvFiles(outDir, ctx, modules));

  // 6. CI workflows — the `ci` component is a codegen marker (no template
  // files); it emits per-app, path-filtered GitHub Actions for present apps.
  if (selection.modules.includes("ci")) {
    for (const [rel, content] of Object.entries(buildCiWorkflows(ctx))) {
      writeFileEnsured(join(outDir, rel), content);
      written.push(rel);
    }
  }

  // 6b. Server Dockerfile — emitted from code (not a copied template) so it can
  // target uv or pip. The `docker` module still ships .dockerignore + compose.
  if (selection.modules.includes("docker") && ctx.hasServer) {
    const rel = "apps/server/Dockerfile";
    writeFileEnsured(join(outDir, rel), buildServerDockerfile(ctx));
    written.push(rel);
  }

  // 7. notes
  const notes = modules.flatMap((m) => m.manifest.notes);
  if (preservedRootFiles.length) {
    notes.push(
      `Kept your edited root file(s): ${preservedRootFiles.join(", ")}. ` +
        `The regenerated version of each was written alongside as ` +
        `<file>.partweave-new — reconcile any new workspace members, then delete the .partweave-new file(s).`,
    );
  }

  // 8. reporting: which of each module's declared targets were present (applied)
  // vs. absent (skipped). Placement above only wires targets that exist; this
  // records the silent drops so create/add/plan can surface them.
  const { appliedTargets, skippedTargets } = partitionTargets(modules, selectedTargets(ctx));

  return { written, notes, appliedTargets, skippedTargets };
}
