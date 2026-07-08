// Copy repo-root assets the published package needs into this package so
// `npm publish` actually ships them. npm ignores `files` entries outside the
// package root (like `../../modules`) and looks for README/LICENSE in the
// package dir only — without this the CLI would install with no templates
// (and no license/readme) and fail at runtime. Runs via the `prepack` script.
import { cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(dirname(fileURLToPath(import.meta.url))); // packages/cli
const root = join(pkgDir, "..", ".."); // repo root
const copied = ["modules", "README.md", "LICENSE"];

// `--clean` (run from postpack) removes the copied artifacts again. Otherwise a
// leftover packages/cli/modules/ would shadow the repo-root catalog on the next
// local CLI run (paths.ts finds it first), silently serving stale templates.
if (process.argv.includes("--clean")) {
  for (const name of copied) await rm(join(pkgDir, name), { recursive: true, force: true });
  console.log("▸ Cleaned bundled publish artifacts");
  process.exit(0);
}

// The templates catalog — the CLI is useless without it.
const modulesSrc = join(root, "modules");
const modulesDest = join(pkgDir, "modules");
if (!existsSync(join(modulesSrc, "_core"))) {
  console.error(`✗ modules catalog not found at ${modulesSrc} (expected a _core/ inside it)`);
  process.exit(1);
}
await rm(modulesDest, { recursive: true, force: true });
await cp(modulesSrc, modulesDest, { recursive: true });
console.log(`▸ Bundled modules/ into ${modulesDest}`);

// README + LICENSE so the npm package page and license metadata are populated.
for (const file of ["README.md", "LICENSE"]) {
  const src = join(root, file);
  if (existsSync(src)) {
    await cp(src, join(pkgDir, file));
    console.log(`▸ Copied ${file}`);
  }
}
