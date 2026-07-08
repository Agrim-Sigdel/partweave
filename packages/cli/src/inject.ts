/**
 * Wiring primitives: deterministic, idempotent injection at anchor comments and
 * dependency merging. All functions take file *content* and return new content,
 * so callers control IO.
 */

/** Build the regex that finds an anchor line for a given id. */
function anchorRegex(anchorId: string): RegExp {
  // matches any line containing `<quick-build:anchorId>` (comment syntax agnostic)
  return new RegExp(`^([ \\t]*).*<quick-build:${escapeRe(anchorId)}>.*$`, "m");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Inserts `lines` immediately before the `<quick-build:anchorId>` line, matching its
 * indentation. Idempotent: a line already present (trimmed) is skipped.
 * Returns the new content and how many lines were actually inserted.
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
    throw new Error(`Anchor <quick-build:${anchorId}> not found in target file`);
  }
  const indent = match[1] ?? "";
  const existing = new Set(
    content.split("\n").map((l) => l.trim()).filter(Boolean),
  );
  const toInsert = lines.filter((l) => !existing.has(l.trim()));
  if (toInsert.length === 0) return { content, inserted: 0 };

  const block = toInsert.map((l) => (l ? indent + l : "")).join("\n") + "\n";
  const anchorStart = match.index;
  const newContent =
    content.slice(0, anchorStart) + block + content.slice(anchorStart);
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

/** Merge npm deps into a package.json string, sorted, idempotent. */
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
    if (!(name in bucket)) bucket[name] = version;
  }
  pkg[field] = Object.fromEntries(
    Object.entries(bucket).sort(([a], [b]) => a.localeCompare(b)),
  );
  return JSON.stringify(pkg, null, 2) + "\n";
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
