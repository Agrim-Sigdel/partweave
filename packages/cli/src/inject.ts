/**
 * Wiring primitives: deterministic, idempotent injection at anchor comments and
 * dependency merging. All functions take file *content* and return new content,
 * so callers control IO.
 */

/** Build the regex that finds an anchor line for a given id. */
function anchorRegex(anchorId: string): RegExp {
  // matches any line containing `<partweave:anchorId>` (comment syntax agnostic)
  return new RegExp(`^([ \\t]*).*<partweave:${escapeRe(anchorId)}>.*$`, "m");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Inserts `lines` immediately before the `<partweave:anchorId>` line, matching its
 * indentation. Returns the new content and how many lines were actually inserted.
 *
 * Idempotency is **scoped to the anchor's own block** — the contiguous run of
 * non-blank lines immediately above the anchor (its enclosing list/section) — not
 * the whole file. Deduping against the whole file (the old behavior) silently
 * dropped a line that legitimately also appears at a *different* anchor, causing
 * under-wiring; scoping to the block fixes that while staying idempotent on
 * re-runs and `add`.
 */
export function injectAtAnchor(
  content: string,
  anchorId: string,
  lines: string[],
): { content: string; inserted: number } {
  if (lines.length === 0) return { content, inserted: 0 };
  const re = anchorRegex(anchorId);
  const match = re.exec(content);
  if (!match) {
    throw new Error(`Anchor <partweave:${anchorId}> not found in target file`);
  }
  const indent = match[1] ?? "";

  // The block: walk upward from the anchor, collecting lines until a blank line
  // (section boundary) or the start of file. Django settings lists / provider
  // arrays have no internal blanks and are blank-separated from each other, so
  // this naturally scopes dedup to the structure the anchor lives in.
  const before = content.slice(0, match.index).split("\n");
  if (before[before.length - 1] === "") before.pop(); // the newline before the anchor
  const block = new Set<string>();
  for (let i = before.length - 1; i >= 0; i--) {
    const trimmed = before[i].trim();
    if (trimmed === "") break;
    block.add(trimmed);
  }

  const toInsert = lines.filter((l) => !block.has(l.trim()));
  if (toInsert.length === 0) return { content, inserted: 0 };

  const insertion = toInsert.map((l) => (l ? indent + l : "")).join("\n") + "\n";
  const anchorStart = match.index;
  const newContent =
    content.slice(0, anchorStart) + insertion + content.slice(anchorStart);
  return { content: newContent, inserted: toInsert.length };
}

export function hasAnchor(content: string, anchorId: string): boolean {
  return anchorRegex(anchorId).test(content);
}

/** Parse "name@version" (supports scoped @scope/name@version). */
export function parseDep(dep: string): { name: string; version: string } {
  const at = dep.lastIndexOf("@");
  if (at > 0) {
    return { name: dep.slice(0, at), version: dep.slice(at + 1) };
  }
  return { name: dep, version: "latest" };
}

/**
 * Rewrite the `workspace:*` protocol in `name@version` dep strings to the range
 * the project's package manager understands. Module manifests always author
 * sibling deps as `workspace:*` (the pnpm/yarn form); npm rejects that protocol,
 * so for an npm project it becomes a plain `*` (which npm resolves to the local
 * workspace member). Non-workspace deps pass through untouched.
 */
export function normalizeWorkspaceDeps(
  deps: string[],
  workspaceRange: string,
): string[] {
  return deps.map((dep) => {
    const { name, version } = parseDep(dep);
    if (version.startsWith("workspace:")) return `${name}@${workspaceRange}`;
    return dep;
  });
}

/**
 * Compare two version ranges by their numeric core and return the higher one
 * (keeping its original `^`/`~`/`>=` prefix). Ties, or anything unparseable
 * (e.g. `workspace:*`, `latest`, a git URL), resolve to `a` — so an existing pin
 * is never silently downgraded. Not a full semver range solver; enough to stop
 * two components from pinning conflicting versions of the same package.
 */
export function higherVersion(a: string, b: string): string {
  const core = (v: string): number[] | null => {
    const m = v.match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (!m || m[1] === undefined) return null;
    return [m[1], m[2], m[3]].map((n) => (n === undefined ? 0 : Number(n)));
  };
  const ca = core(a);
  const cb = core(b);
  if (!ca || !cb) return a;
  for (let i = 0; i < 3; i++) {
    if (ca[i] !== cb[i]) return ca[i] > cb[i] ? a : b;
  }
  return a;
}

/**
 * Merge npm deps into a package.json string, sorted. When a package is already
 * present, keep the **higher** of the two versions (semver-max) rather than
 * first-wins, so stacking components can't pin an older version over a newer one.
 */
export function mergePackageJsonDeps(
  pkgJson: string,
  deps: string[],
  field: "dependencies" | "devDependencies" = "dependencies",
): string {
  if (deps.length === 0) return pkgJson;
  const pkg = JSON.parse(pkgJson) as Record<string, unknown>;
  const bucket = (pkg[field] as Record<string, string> | undefined) ?? {};
  for (const dep of deps) {
    const { name, version } = parseDep(dep);
    bucket[name] = name in bucket ? higherVersion(bucket[name], version) : version;
  }
  pkg[field] = Object.fromEntries(
    Object.entries(bucket).sort(([a], [b]) => a.localeCompare(b)),
  );
  return JSON.stringify(pkg, null, 2) + "\n";
}

/**
 * Base distribution name of a Python requirement string — drops surrounding
 * quotes, extras (`[binary]`), version specifiers, and markers, lower-cased.
 * `"psycopg[binary]>=3.2"` → `psycopg`. Used to merge pyproject deps by name so
 * two components can't add conflicting lines for the same package.
 */
export function pyDepName(dep: string): string {
  return dep
    .trim()
    .replace(/^["']|["']$/g, "")
    .split(/[<>=!~;[\s]/)[0]
    .trim()
    .toLowerCase();
}

/** Append env keys to a .env.example body, skipping ones already present. */
export function appendEnv(
  envBody: string,
  entries: Record<string, string>,
  heading?: string,
): string {
  const keys = Object.keys(entries);
  if (keys.length === 0) return envBody;
  const present = new Set(
    envBody
      .split("\n")
      .map((l) => l.split("=")[0]?.trim())
      .filter(Boolean),
  );
  const missing = keys.filter((k) => !present.has(k));
  if (missing.length === 0) return envBody;
  let out = envBody.replace(/\n*$/, "\n");
  if (heading) out += `\n# ${heading}\n`;
  for (const k of missing) out += `${k}=${entries[k]}\n`;
  return out;
}
