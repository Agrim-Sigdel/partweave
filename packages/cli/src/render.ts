import type { RenderContext } from "./types.js";

/**
 * Minimal, collision-safe templating: replaces only `{{ known.token }}` where
 * the token is a known key. React's `style={{ ... }}` and JS `${...}` never
 * match, because the inner text must be a dotted identifier immediately closed
 * by `}}`. Unknown tokens are left untouched.
 */
const TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;

export function buildScalars(ctx: RenderContext): Record<string, string> {
  return {
    projectName: ctx.projectName,
    projectSlug: ctx.projectSlug,
    description: ctx.description,
    // Java/Android package segments allow underscores but not hyphens.
    packageId: "com.example." + ctx.projectSlug.replace(/-/g, "_"),
    "apps.list": ctx.apps.join(", "),
  };
}

export function render(content: string, ctx: RenderContext): string {
  const scalars = buildScalars(ctx);
  return content.replace(TOKEN, (whole, key: string) => {
    if (Object.prototype.hasOwnProperty.call(scalars, key)) return scalars[key];
    return whole; // leave unknown tokens as-is
  });
}

/** Files that must be copied byte-for-byte (never templated). */
const BINARY_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".ttf",
  ".otf",
  ".woff",
  ".woff2",
  ".pdf",
  ".zip",
]);

export function isBinaryPath(p: string): boolean {
  const dot = p.lastIndexOf(".");
  if (dot === -1) return false;
  return BINARY_EXT.has(p.slice(dot).toLowerCase());
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * Why `name` can't be used as a project name, or undefined if it's fine.
 * Shared by the interactive prompt (as its validate callback) and the
 * non-interactive flag path. A name that slugifies to "" is rejected because
 * the default target directory is `./${slugify(name)}` — an empty slug would
 * silently resolve to the current working directory.
 */
export function projectNameError(name: string): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return "Project name is required.";
  if (trimmed.length > 64) return "Project name must be 64 characters or fewer.";
  if (!slugify(trimmed)) {
    return `"${trimmed}" contains no letters or digits to build a directory name from.`;
  }
  return undefined;
}
