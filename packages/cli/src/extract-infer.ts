/**
 * Inference helpers for `partweave extract` (Task 1).
 *
 * An extracted module is derived from a *live* generated project. The feature's
 * files are copied verbatim, but its **wiring** (the lines it injected into the
 * _core scaffold at `<partweave:...>` anchors) and its **dependencies** on other
 * modules are not written down anywhere — they live implicitly in the project's
 * anchored files. These helpers recover them:
 *
 *   - `inferWiring` composes a *reference* project WITHOUT the feature and diffs
 *     the live project's anchored files against it. The per-anchor delta lines
 *     ARE the module's wiring.
 *   - `inferRequires` scans the extracted code's imports and attributes any that
 *     land in another installed module's territory to a `requires` entry.
 *   - Imports that resolve neither into the extracted paths, _core, a known
 *     third-party package, nor another module are reported as dangling
 *     (self-containment) warnings rather than guessed at.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { isBinaryPath } from "./render.js";
import {
  APPS,
  TARGET_DEST,
  type TargetName,
  type WiringForTarget,
} from "./types.js";
import type { Registry } from "./registry.js";

/** Directories that can never hold our anchors / first-party source we care about. */
const SCAN_IGNORE = new Set([
  "node_modules",
  ".git",
  ".venv",
  "venv",
  "__pycache__",
  ".next",
  ".expo",
  ".turbo",
  ".partweave",
  "dist",
  "build",
  "migrations",
]);

/** The array-valued convenience wiring fields (each maps to a well-known anchor). */
type ArrayField = "installedApps" | "urls" | "settings" | "providers" | "routes";

/** Convenience wiring field for a well-known anchor id (mirrors CONVENIENCE_ANCHORS). */
const FIELD_BY_ANCHOR: Record<string, ArrayField> = {
  "installed-apps": "installedApps",
  urls: "urls",
  settings: "settings",
  providers: "providers",
  routes: "routes",
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches the first line carrying `<partweave:anchorId>`, capturing its indent. */
function anchorRegex(anchorId: string): RegExp {
  return new RegExp(`^([ \\t]*).*<partweave:${escapeRe(anchorId)}>.*$`, "m");
}

/**
 * The injection block for an anchor: the contiguous run of non-blank lines
 * immediately above the anchor marker (its enclosing list/section), matching
 * `injectAtAnchor`'s block model so what we recover is exactly what would be
 * re-injected. Returns the raw lines (indentation intact), top-to-bottom.
 */
export function extractBlock(
  content: string,
  anchorId: string,
): { indent: string; lines: string[] } | null {
  const m = anchorRegex(anchorId).exec(content);
  if (!m) return null;
  const indent = m[1] ?? "";
  const before = content.slice(0, m.index).split("\n");
  if (before[before.length - 1] === "") before.pop(); // newline before the anchor
  const lines: string[] = [];
  for (let i = before.length - 1; i >= 0; i--) {
    if (before[i].trim() === "") break;
    lines.unshift(before[i]);
  }
  return { indent, lines };
}

/** Strip the anchor's own indent prefix so the emitted line round-trips through injection. */
function stripIndent(line: string, indent: string): string {
  return line.startsWith(indent) ? line.slice(indent.length) : line.replace(/^\s+/, "");
}

/**
 * Lines present at `anchorId` in `live` but absent in `ref` (the same file
 * composed without the feature) — i.e. the feature's contribution to that
 * anchor, ready to drop into a wiring array.
 */
export function anchorDelta(
  live: string,
  ref: string | null,
  anchorId: string,
): { indent: string; delta: string[] } {
  const liveBlock = extractBlock(live, anchorId);
  if (!liveBlock) return { indent: "", delta: [] };
  const refBlock = ref ? extractBlock(ref, anchorId) : null;
  const refTrim = new Set((refBlock?.lines ?? []).map((l) => l.trim()));
  const delta = liveBlock.lines
    .filter((l) => l.trim() !== "" && !refTrim.has(l.trim()))
    .map((l) => stripIndent(l, liveBlock.indent));
  return { indent: liveBlock.indent, delta };
}

/** Normalize a pyproject dependency line (`"boto3>=1.35",`) to a bare spec (`boto3>=1.35`). */
function stripPyDepLine(line: string): string {
  return line
    .trim()
    .replace(/,\s*$/, "")
    .replace(/^["']|["']$/g, "");
}

/** Recursively walk `dir`, yielding readable text files as [absPath, relPath]. */
function* walkText(dir: string, root = dir): Generator<[string, string]> {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SCAN_IGNORE.has(name)) continue;
    const abs = join(dir, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      yield* walkText(abs, root);
      continue;
    }
    if (isBinaryPath(abs)) continue;
    yield [abs, relative(root, abs)];
  }
}

/** anchor id → the files under `targetDir` that contain that anchor. */
function anchorFileIndex(targetDir: string): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const re = /<partweave:([\w-]+)>/g;
  for (const [abs] of walkText(targetDir)) {
    const content = readFileSync(abs, "utf8");
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) {
      const arr = index.get(m[1]) ?? [];
      if (!arr.includes(abs)) arr.push(abs);
      index.set(m[1], arr);
    }
  }
  return index;
}

function pushUnique(arr: string[], value: string): void {
  if (!arr.includes(value)) arr.push(value);
}

/** The `dependencies` map of a package.json, or `{}` when absent/unparseable. */
function readJsonDeps(pkgPath: string): Record<string, string> {
  if (!existsSync(pkgPath)) return {};
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    return pkg.dependencies ?? {};
  } catch {
    return {};
  }
}

/** Route an anchor's delta lines into the right wiring field for one target. */
function routeAnchor(w: WiringForTarget, anchorId: string, delta: string[]): void {
  if (delta.length === 0) return;
  if (anchorId === "deps") {
    w.deps ??= [];
    for (const line of delta) pushUnique(w.deps, stripPyDepLine(line));
    return;
  }
  const field = FIELD_BY_ANCHOR[anchorId];
  if (field) {
    const bucket = (w[field] ??= []);
    for (const line of delta) pushUnique(bucket, line);
    return;
  }
  w.anchors ??= {};
  const bucket = (w.anchors[anchorId] ??= []);
  for (const line of delta) pushUnique(bucket, line);
}

/** Infer one target's wiring by diffing its anchored files, live vs. reference. */
function inferWiringForTarget(
  liveTargetDir: string,
  refTargetDir: string,
  target: TargetName,
): WiringForTarget {
  const w: WiringForTarget = {};
  const index = anchorFileIndex(liveTargetDir);

  for (const [anchorId, files] of index) {
    for (const abs of files) {
      const rel = relative(liveTargetDir, abs);
      const live = readFileSync(abs, "utf8");
      const refPath = join(refTargetDir, rel);
      const ref = existsSync(refPath) ? readFileSync(refPath, "utf8") : null;
      const { delta } = anchorDelta(live, ref, anchorId);
      routeAnchor(w, anchorId, delta);
    }
  }

  // package.json deps are not anchor-comment based (JS/TS targets only): diff the
  // app's dependency map against the reference to recover the feature's additions.
  if (target === "web" || target === "mobile") {
    const live = readJsonDeps(join(liveTargetDir, "package.json"));
    const ref = readJsonDeps(join(refTargetDir, "package.json"));
    for (const [name, version] of Object.entries(live)) {
      if (ref[name] === undefined) {
        w.deps ??= [];
        pushUnique(w.deps, `${name}@${version}`);
      }
    }
  }

  return w;
}

/** True when a wiring object carries no injected lines / deps. */
export function isEmptyWiring(w: WiringForTarget): boolean {
  const anchorsEmpty = !w.anchors || Object.values(w.anchors).every((a) => a.length === 0);
  return (
    !w.installedApps?.length &&
    !w.urls?.length &&
    !w.settings?.length &&
    !w.providers?.length &&
    !w.routes?.length &&
    !w.deps?.length &&
    anchorsEmpty
  );
}

/**
 * Diff every anchored file in `liveDir` against the feature-free `refDir` and
 * return the per-target wiring the feature contributes (empty targets omitted).
 */
export function inferWiring(
  liveDir: string,
  refDir: string,
  targets: Iterable<TargetName>,
): Partial<Record<TargetName, WiringForTarget>> {
  const out: Partial<Record<TargetName, WiringForTarget>> = {};
  for (const t of targets) {
    const w = inferWiringForTarget(
      join(liveDir, TARGET_DEST[t]),
      join(refDir, TARGET_DEST[t]),
      t,
    );
    if (!isEmptyWiring(w)) out[t] = w;
  }
  return out;
}

// ---------------------------------------------------------------------------
// requires / self-containment inference
// ---------------------------------------------------------------------------

/** Python stdlib + framework/third-party top-level names that never denote a module dep. */
const PY_KNOWN = new Set([
  // stdlib (common)
  "abc", "argparse", "asyncio", "base64", "collections", "contextlib", "copy",
  "csv", "dataclasses", "datetime", "decimal", "enum", "functools", "hashlib",
  "hmac", "io", "itertools", "json", "logging", "math", "os", "pathlib",
  "random", "re", "secrets", "shutil", "string", "subprocess", "sys",
  "tempfile", "time", "types", "typing", "unittest", "urllib", "uuid", "warnings",
  // django / drf / common backend libs
  "django", "rest_framework", "rest_framework_simplejwt", "corsheaders",
  "environ", "boto3", "botocore", "celery", "redis", "psycopg", "psycopg2",
  "pytest", "requests", "gunicorn", "whitenoise", "PIL", "storages",
  // the _core server package
  "config",
]);

/** TS/JS bare specifiers whose presence never denotes a module dep (they're npm deps or core). */
const TS_KNOWN_PREFIXES = ["react", "next", "expo", "@expo/", "@app/shared", "zod", "@tanstack/"];

interface Territory {
  /** Django app label (server top-level dir) → owning module id. */
  server: Map<string, string>;
  /** TS source segment (web/mobile/shared src top-level dir) → owning module id. */
  ts: Map<string, string>;
}

/** Top-level directory names directly under `dir` (files skipped). */
function topDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => {
    if (n.startsWith(".") || SCAN_IGNORE.has(n)) return false;
    try {
      return statSync(join(dir, n)).isDirectory();
    } catch {
      return false;
    }
  });
}

/** Map each installed module's Django app labels / TS source segments to its id. */
function buildTerritory(registry: Registry, moduleIds: string[]): Territory {
  const server = new Map<string, string>();
  const ts = new Map<string, string>();
  for (const id of moduleIds) {
    const mod = registry.get(id);
    if (!mod) continue;
    for (const label of topDirs(join(mod.dir, "server"))) {
      if (label !== "config" && label !== "tests") server.set(label, id);
    }
    for (const sub of ["web", "mobile", "shared"]) {
      for (const seg of topDirs(join(mod.dir, sub, "src"))) ts.set(seg, id);
      for (const seg of topDirs(join(mod.dir, sub, "app"))) ts.set(seg, id);
    }
  }
  return { server, ts };
}

/** The Django app labels / TS segments the extracted feature itself provides. */
function selfLabels(extractRoot: string): { server: Set<string>; ts: Set<string> } {
  const server = new Set(topDirs(join(extractRoot, "server")));
  const ts = new Set<string>();
  for (const sub of ["web", "mobile", "shared"]) {
    for (const seg of topDirs(join(extractRoot, sub, "src"))) ts.add(seg);
    for (const seg of topDirs(join(extractRoot, sub, "app"))) ts.add(seg);
  }
  return { server, ts };
}

/** Top-level module of a Python import (`accounts.urls` → `accounts`). */
function pyImports(content: string): string[] {
  const out: string[] = [];
  const re = /^\s*(?:from\s+([.\w]+)\s+import|import\s+([.\w]+))/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const spec = m[1] ?? m[2] ?? "";
    out.push(spec);
  }
  return out;
}

/** Every specifier string in a TS/JS `import ... from "X"` / `require("X")`. */
function tsImports(content: string): string[] {
  const out: string[] = [];
  const re = /(?:from|require\()\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) out.push(m[1]);
  return out;
}

export interface RequiresResult {
  /** module ids the extracted code imports into (sorted, unique). */
  requires: string[];
  /** first-party imports that resolve outside the feature, _core, and known deps. */
  warnings: string[];
}

/**
 * Infer `requires` from the extracted code's imports and flag dangling references.
 * An import landing in another installed module's territory becomes a confident
 * `requires`; a first-party import we can't attribute is reported as a warning
 * (self-containment) rather than guessed at.
 */
export function inferRequires(
  extractRoot: string,
  registry: Registry,
  installedModuleIds: string[],
  selfId: string,
): RequiresResult {
  const territory = buildTerritory(registry, installedModuleIds);
  const self = selfLabels(extractRoot);
  const requires = new Set<string>();
  const warnings: string[] = [];
  const seenWarn = new Set<string>();

  for (const [abs, rel] of walkText(extractRoot)) {
    const isPy = abs.endsWith(".py");
    const isTs = /\.(tsx?|jsx?|mjs|cjs)$/.test(abs);
    if (!isPy && !isTs) continue;
    const content = readFileSync(abs, "utf8");

    if (isPy) {
      for (const spec of pyImports(content)) {
        const top = spec.replace(/^\.+/, "").split(".")[0];
        if (spec.startsWith(".") || top === "") continue; // relative → self
        if (self.server.has(top)) continue; // provided by the extracted feature
        if (PY_KNOWN.has(top)) continue; // stdlib / framework / _core
        const owner = territory.server.get(top);
        if (owner && owner !== selfId) {
          requires.add(owner);
        } else if (!owner) {
          const key = `py:${top}`;
          if (!seenWarn.has(key)) {
            seenWarn.add(key);
            warnings.push(
              `Import "${top}" in ${rel} resolves outside the extracted paths and _core — ` +
                `the module may not be self-contained.`,
            );
          }
        }
      }
    } else {
      for (const spec of tsImports(content)) {
        if (spec.startsWith(".")) continue; // relative → self / sibling
        if (spec.startsWith("@/")) {
          const seg = spec.slice(2).split("/")[0];
          if (self.ts.has(seg)) continue;
          const owner = territory.ts.get(seg);
          if (owner && owner !== selfId) {
            requires.add(owner);
          } else if (!owner) {
            const key = `ts:${seg}`;
            if (!seenWarn.has(key)) {
              seenWarn.add(key);
              warnings.push(
                `Alias import "@/${seg}" in ${rel} resolves outside the extracted paths and _core — ` +
                  `the module may not be self-contained.`,
              );
            }
          }
          continue;
        }
        // Bare/scoped npm specifiers are dependency-managed, not module requires.
        if (TS_KNOWN_PREFIXES.some((p) => spec === p || spec.startsWith(p))) continue;
      }
    }
  }

  return { requires: [...requires].sort(), warnings };
}

/**
 * The app set needed to round-trip a module: its app-kind targets plus its
 * `requiresApps`, widened so shared/api-client targets have an app to attach to.
 */
export function deriveApps(targets: TargetName[], requiresApps: string[]): Array<(typeof APPS)[number]> {
  const isApp = (t: string): t is (typeof APPS)[number] => (APPS as readonly string[]).includes(t);
  const apps = new Set<(typeof APPS)[number]>();
  for (const t of targets) if (isApp(t)) apps.add(t);
  for (const a of requiresApps) if (isApp(a)) apps.add(a);
  if (targets.includes("shared") && !apps.has("web") && !apps.has("mobile")) apps.add("web");
  if (targets.includes("api-client")) {
    apps.add("server");
    if (!apps.has("web") && !apps.has("mobile")) apps.add("web");
  }
  return [...apps];
}

/** Join path segments with the platform separator (kept for cross-platform tests). */
export function joinRel(...parts: string[]): string {
  return parts.join(sep);
}
