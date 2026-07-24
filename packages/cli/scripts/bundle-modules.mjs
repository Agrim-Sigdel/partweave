// Copy repo-root assets the published package needs into this package so
// `npm publish` actually ships them. npm ignores `files` entries outside the
// package root (like `../../modules`) and looks for README in the package
// dir only — without this the CLI would install with no templates (and no
// readme) and fail at runtime. Runs via the `prepack` script.
import { cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(dirname(fileURLToPath(import.meta.url))); // packages/cli
const root = join(pkgDir, "..", ".."); // repo root
const copied = ["README.md", "modules"];

// `--clean` (run from postpack) removes the copied artifacts again. Otherwise a
// leftover packages/cli/modules/ would shadow the repo-root catalog on the next
// local CLI run (paths.ts finds it first), silently serving stale templates.
if (process.argv.includes("--clean")) {
  for (const name of copied) await rm(join(pkgDir, name), { recursive: true, force: true });
  console.log("▸ Cleaned bundled publish artifacts");
  process.exit(0);
}

// The templates catalog ships *inside* the package. It used to be cloned from
// GitHub on first run, which made every install depend on git + network being
// present and working — a dependency that never fired in this monorepo (the
// repo-root modules/ is always found first), so it was only ever exercised on
// users' machines. At ~50 KB gzipped for 93 files it costs nothing to bundle,
// and `partweave --update` still refreshes from GitHub for a newer catalog.
const modulesSrc = join(root, "modules");
if (!existsSync(modulesSrc)) {
  console.error("✖ No modules/ at the repo root — refusing to pack a CLI with no templates.");
  process.exit(1);
}
await rm(join(pkgDir, "modules"), { recursive: true, force: true });
await cp(modulesSrc, join(pkgDir, "modules"), {
  recursive: true,
  // Python bytecode is build output, not a template; it also bloats the tarball
  // and can leak absolute paths from the machine that packed it.
  filter: (src) => !src.includes("__pycache__") && !src.endsWith(".pyc"),
});
console.log("▸ Copied modules/ catalog");

// README so the npm package page ships with the package.
for (const file of ["README.md"]) {
  const src = join(root, file);
  if (existsSync(src)) {
    await cp(src, join(pkgDir, file));
    console.log(`▸ Copied ${file}`);
  }
}
