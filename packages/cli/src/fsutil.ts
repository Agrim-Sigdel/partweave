import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse, relative, resolve, sep } from "node:path";
import { isBinaryPath, render } from "./render.js";
import type { RenderContext } from "./types.js";

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

/**
 * Why `dir` must never be deleted wholesale (even with --force), or null if
 * replacing it is fine: the filesystem root, the user's home directory, the
 * process cwd, or an ancestor of the cwd. Deleting an ancestor of the cwd
 * (or the cwd itself) invalidates the running process's working directory.
 */
export function protectedDirReason(dir: string): string | null {
  const target = resolve(dir);
  if (target === parse(target).root) return "the filesystem root";
  if (target === resolve(homedir())) return "your home directory";
  const cwd = process.cwd();
  if (target === cwd) return "the current working directory";
  if (cwd.startsWith(target + sep)) return "an ancestor of the current working directory";
  return null;
}

export function readIfExists(p: string): string | null {
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

export function writeFileEnsured(p: string, content: string): void {
  ensureDir(dirname(p));
  writeFileSync(p, content);
}

/** List every file (recursively) under `root`, as paths relative to `root`. */
export function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else out.push(relative(root, abs));
    }
  };
  if (existsSync(root)) walk(root);
  return out;
}

/**
 * Copy a template tree into `destRoot`, rendering text files through {{tokens}}.
 * Skips the module.json manifest. `gitignore` files are renamed from the safe
 * `_gitignore` template name back to `.gitignore` on copy.
 */
export function copyTree(
  srcRoot: string,
  destRoot: string,
  ctx: RenderContext,
): string[] {
  const written: string[] = [];
  for (const rel of listFiles(srcRoot)) {
    if (rel === "module.json") continue;
    const src = join(srcRoot, rel);
    // Match both separators: listFiles returns OS-native paths, so a nested
    // _gitignore is "sub\_gitignore" on Windows (F35).
    const destRel = rel.replace(/(^|[/\\])_gitignore$/, "$1.gitignore");
    const dest = join(destRoot, destRel);
    ensureDir(dirname(dest));
    if (isBinaryPath(src)) {
      cpSync(src, dest);
    } else {
      writeFileSync(dest, render(readFileSync(src, "utf8"), ctx));
    }
    written.push(destRel);
  }
  return written;
}
