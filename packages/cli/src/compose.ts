import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  appendEnv,
  injectAtAnchor,
  mergePackageJsonDeps,
} from "./inject.js";
import { copyTree, listFiles, writeFileEnsured } from "./fsutil.js";
import type { Registry } from "./registry.js";
import { isBinaryPath, slugify } from "./render.js";
import {
  buildBaseEnv,
  buildCiWorkflows,
  buildMakefile,
  buildNpmrc,
  buildPnpmWorkspace,
  buildReadme,
  buildRootPackageJson,
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

export interface ComposeOptions {
  selection: Selection;
  registry: Registry;
  mode: "create" | "add";
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
    description: `${selection.projectName} — generated with quick-build.`,
    apps: selection.apps,
    hasServer,
    hasWeb,
    hasMobile,
    hasShared,
    hasApiClient,
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

/** Scan a directory tree for `<quick-build:id>` anchors → the files that contain them. */
function buildAnchorIndex(dir: string): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const re = /<quick-build:([\w-]+)>/g;
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
      `Wiring error: anchor <quick-build:${anchorId}> not found in ${targetLabel}. ` +
        `Add the anchor to the _core/${targetLabel} scaffold.`,
    );
  }
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const { content: next } = injectAtAnchor(content, anchorId, lines);
    writeFileSync(file, next);
  }
}

function applyWiring(
  outDir: string,
  targets: Set<TargetName>,
  modules: Module[],
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
          // Python deps → inject into pyproject's <quick-build:deps> anchor
          const lines = wiring.deps.map((d) => `"${d}",`);
          injectIntoFiles(index, "deps", lines, t);
        } else {
          const pkgPath = join(targetDir, "package.json");
          if (existsSync(pkgPath)) {
            const merged = mergePackageJsonDeps(
              readFileSync(pkgPath, "utf8"),
              wiring.deps,
            );
            writeFileSync(pkgPath, merged);
          }
        }
      }
    }
  }
}

function applyEnv(outDir: string, modules: Module[]): void {
  const envPath = join(outDir, ".env.example");
  let body = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  for (const mod of modules) {
    if (Object.keys(mod.manifest.env).length === 0) continue;
    body = appendEnv(body, mod.manifest.env, mod.manifest.title);
  }
  if (body) writeFileSync(envPath, body);
}

function writeComputedRootFiles(
  outDir: string,
  ctx: RenderContext,
  modules: Module[],
): void {
  const workspace = buildPnpmWorkspace(ctx);
  if (workspace) writeFileEnsured(join(outDir, "pnpm-workspace.yaml"), workspace);
  const rootPkg = buildRootPackageJson(ctx);
  if (rootPkg) writeFileEnsured(join(outDir, "package.json"), rootPkg);
  const turbo = buildTurboJson(ctx);
  if (turbo) writeFileEnsured(join(outDir, "turbo.json"), turbo);
  const tsbase = buildTsconfigBase(ctx);
  if (tsbase) writeFileEnsured(join(outDir, "tsconfig.base.json"), tsbase);
  const npmrc = buildNpmrc(ctx);
  if (npmrc) writeFileEnsured(join(outDir, ".npmrc"), npmrc);
  const hasDocker = modules.some((m) => m.manifest.id === "docker");
  writeFileEnsured(join(outDir, "Makefile"), buildMakefile(ctx, hasDocker));
  writeFileEnsured(join(outDir, ".env.example"), buildBaseEnv(ctx));
  writeFileEnsured(join(outDir, "README.md"), buildReadme(ctx, modules));
}

export function compose(opts: ComposeOptions): ComposeResult {
  const { selection, registry, mode } = opts;
  const ctx = buildContext(selection);
  const targets = selectedTargets(ctx);
  const outDir = selection.outDir;
  const modules = selection.modules.map((id) => registry.require(id));
  const written: string[] = [];

  // 1. core scaffolds + computed root files (create only)
  if (mode === "create") {
    for (const t of COPY_ORDER) {
      if (!targets.has(t)) continue;
      const src = join(registry.modulesDir, "_core", t);
      if (existsSync(src)) {
        written.push(...copyTree(src, join(outDir, TARGET_DEST[t]), ctx));
      }
    }
    writeComputedRootFiles(outDir, ctx, modules);
  }

  // 2. module files
  for (const mod of modules) {
    for (const t of mod.manifest.targets) {
      if (!targets.has(t)) continue;
      const src = join(mod.dir, t);
      if (existsSync(src)) {
        written.push(...copyTree(src, join(outDir, TARGET_DEST[t]), ctx));
      }
    }
  }

  // 3. wiring
  applyWiring(outDir, targets, modules);

  // 4. env
  applyEnv(outDir, modules);

  // 4b. CI workflows — the `ci` component is a codegen marker (no template
  // files); it emits per-app, path-filtered GitHub Actions for present apps.
  if (selection.modules.includes("ci")) {
    for (const [rel, content] of Object.entries(buildCiWorkflows(ctx))) {
      writeFileEnsured(join(outDir, rel), content);
      written.push(rel);
    }
  }

  // 5. notes
  const notes = modules.flatMap((m) => m.manifest.notes);
  return { written, notes };
}
