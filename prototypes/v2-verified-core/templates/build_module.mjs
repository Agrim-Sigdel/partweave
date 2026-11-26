/**
 * Common module-assembly template builder for partweave v2.
 *
 * Takes:
 *   - verified pure core files (emitted by a proof writer or kept in `cores/`)
 *   - abstract framework shell files (Django adapters, common runtime wrapper)
 *   - module metadata + `<partweave:*>` anchor wiring
 * and emits a coherent `modules/<id>/` directory matching partweave's contract.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Assemble a standard partweave module directory from a verified core + shell.
 *
 * @param {object} spec
 * @param {string} spec.id
 * @param {string} spec.title
 * @param {string} spec.description
 * @param {string[]} spec.targets
 * @param {string[]} spec.requiresApps
 * @param {string[]} [spec.requires]
 * @param {Record<string, object>} spec.wiring
 * @param {Array<{ src: string, dest: string }>} spec.files - relative to module outDir
 * @param {Array<{ dest: string, content: string }>} [spec.generatedFiles]
 * @param {string} outRoot - parent directory where `<id>/` is written
 */
export function buildVerifiedModule(spec, outRoot) {
  const moduleDir = join(outRoot, spec.id);
  mkdirSync(moduleDir, { recursive: true });

  const manifest = {
    id: spec.id,
    title: spec.title,
    description: spec.description,
    kind: "feature",
    targets: spec.targets,
    requiresApps: spec.requiresApps,
    requires: spec.requires ?? [],
    default: false,
    wiring: spec.wiring,
  };

  writeFileSync(
    join(moduleDir, "module.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );

  for (const file of spec.files) {
    const targetPath = join(moduleDir, file.dest);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, readFileSync(file.src, "utf8"), "utf8");
  }

  for (const gen of spec.generatedFiles ?? []) {
    const targetPath = join(moduleDir, gen.dest);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, gen.content, "utf8");
  }

  return { moduleDir, manifest };
}
