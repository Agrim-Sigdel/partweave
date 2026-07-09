import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  injectAtAnchor,
  mergePackageJsonDeps,
  normalizeWorkspaceDeps,
  pyDepName,
} from "./inject.js";
import { copyTree, listFiles, writeFileEnsured } from "./fsutil.js";
import { DEFAULT_JS_PM, DEFAULT_PY_PM, jsPmProfile } from "./pm.js";
import type { Registry } from "./registry.js";
import { isBinaryPath, slugify } from "./render.js";
import {
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
}

export interface ComposeResult {
  written: string[];
  notes: string[];
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

/** Scan a directory tree for `<partweave:id>` anchors → the files that contain them. */
function buildAnchorIndex(dir: string): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const re = /<partweave:([\w-]+)>/g;
  for (const rel of listFiles(dir)) {
    const abs = join(dir, rel);
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

function applyWiring(
  outDir: string,
  targets: Set<TargetName>,
  modules: Module[],
  workspaceRange: string,
): void {
  // one anchor index per present target directory
  const indexes = new Map<TargetName, Map<string, string[]>>();
  for (const t of targets) {
    indexes.set(t, buildAnchorIndex(join(outDir, TARGET_DEST[t])));
  }

  for (const mod of modules) {
    for (const t of mod.manifest.targets) {
      if (!targets.has(t)) continue;
      const wiring = mod.manifest.wiring[t];
      if (!wiring) continue;
      const index = indexes.get(t)!;
      const targetDir = join(outDir, TARGET_DEST[t]);

      // anchor-based wiring
      for (const [anchor, lines] of Object.entries(anchorInjections(wiring))) {
        injectIntoFiles(index, anchor, lines, t);
      }

      // dependency merging
      if (wiring.deps?.length) {
        if (t === "server") {
          // Python deps → inject into pyproject's <partweave:deps> anchor, keyed
          // by distribution name so a package already present (from _core or
          // another component) is never added a second time with a different
          // version spec.
          injectPyDeps(index, wiring.deps, t);
        } else {
          const pkgPath = join(targetDir, "package.json");
          if (existsSync(pkgPath)) {
            const merged = mergePackageJsonDeps(
              readFileSync(pkgPath, "utf8"),
              normalizeWorkspaceDeps(wiring.deps, workspaceRange),
            );
            writeFileSync(pkgPath, merged);
          }
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

/** Derived, selection-dependent monorepo shell files (safe to regenerate). */
function writeStructuralRootFiles(
  outDir: string,
  ctx: RenderContext,
  modules: Module[],
): void {
  // pnpm lists workspace members in pnpm-workspace.yaml; npm lists them in
  // package.json's "workspaces" field (built by buildRootPackageJson).
  const workspace = buildJsWorkspace(ctx);
  if (workspace) writeFileEnsured(join(outDir, "pnpm-workspace.yaml"), workspace);
  const hasDocker = modules.some((m) => m.manifest.id === "docker");
  const rootPkg = buildRootPackageJson(ctx, hasDocker);
  if (rootPkg) writeFileEnsured(join(outDir, "package.json"), rootPkg);
  const turbo = buildTurboJson(ctx);
  if (turbo) writeFileEnsured(join(outDir, "turbo.json"), turbo);
  const tsbase = buildTsconfigBase(ctx);
  if (tsbase) writeFileEnsured(join(outDir, "tsconfig.base.json"), tsbase);
  // pip path: a helper that installs the server's deps from pyproject into .venv.
  const pipSync = buildPipSyncScript(ctx);
  if (pipSync) writeFileEnsured(join(outDir, "apps/server/scripts/sync_deps.py"), pipSync);
  // The cross-platform task runner every task delegates to (works on Windows too);
  // the Makefile is a thin Unix wrapper around it.
  writeFileEnsured(join(outDir, "scripts/run.mjs"), buildTaskRunner(ctx, hasDocker));
  writeFileEnsured(join(outDir, "Makefile"), buildMakefile(ctx, hasDocker));
  // Per-app env files are written in the env step (writeEnvFiles), which needs the
  // resolved module list to route component keys.
}

export function compose(opts: ComposeOptions): ComposeResult {
  const { selection, registry, scaffoldTargets, wireTargets, rootFiles } = opts;
  const ctx = buildContext(selection);
  const outDir = selection.outDir;
  const modules = selection.modules.map((id) => registry.require(id));
  const written: string[] = [];

  // 1. scaffold bare _core for new targets
  for (const t of COPY_ORDER) {
    if (!scaffoldTargets.has(t)) continue;
    const src = join(registry.modulesDir, "_core", t);
    if (existsSync(src)) {
      written.push(...copyTree(src, join(outDir, TARGET_DEST[t]), ctx));
    }
  }

  // 2. computed root files (per-app env files are written in step 5, below)
  if (rootFiles !== "none") writeStructuralRootFiles(outDir, ctx, modules);
  if (rootFiles === "all") {
    writeFileEnsured(join(outDir, "README.md"), buildReadme(ctx, modules));
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

  // 4. wiring (restricted to the targets being wired)
  applyWiring(outDir, wireTargets, modules, jsPmProfile(ctx.jsPm).workspaceRange);

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
  return { written, notes };
}
