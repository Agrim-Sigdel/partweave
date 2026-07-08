import { resolve } from "node:path";
import { intro, log, note, outro, spinner } from "@clack/prompts";
import pc from "picocolors";
import { compose } from "../compose.js";
import {
  readProjectManifest,
  writeProjectManifest,
} from "../projectmanifest.js";
import { Registry } from "../registry.js";
import { resolveModules, validateApps } from "../resolve.js";

export interface AddFlags {
  dir?: string;
}

/** `quick-build add <module...>` — adds components to an existing project. */
export async function runAdd(moduleIds: string[], flags: AddFlags): Promise<void> {
  intro(pc.bgCyan(pc.black(" quick-build ")) + pc.dim(" add component"));
  const dir = resolve(flags.dir ?? process.cwd());

  const pm = readProjectManifest(dir);
  if (!pm) {
    log.error(
      `No quick-build project found at ${dir} (missing .quick-build/manifest.json). ` +
        `Run this from inside a generated project, or pass --dir.`,
    );
    process.exit(1);
  }

  if (moduleIds.length === 0) {
    log.error("Specify at least one component to add, e.g. `quick-build add storage`.");
    process.exit(1);
  }

  const registry = new Registry();

  // resolve the union of what's installed + what's requested, then diff
  let resolved;
  try {
    resolved = resolveModules(registry, [...pm.modules, ...moduleIds]);
  } catch (err) {
    log.error((err as Error).message);
    process.exit(1);
  }
  try {
    validateApps(registry, resolved.modules, pm.apps);
  } catch (err) {
    log.error((err as Error).message);
    process.exit(1);
  }
  const installed = new Set(pm.modules);
  const delta = resolved.modules.filter((id) => !installed.has(id));

  if (delta.length === 0) {
    log.info("Everything requested is already installed. Nothing to do.");
    outro(pc.green("Done."));
    return;
  }
  const extra = delta.filter((id) => !moduleIds.includes(id));
  if (extra.length) log.info(`Also adding required components: ${extra.join(", ")}`);

  const s = spinner();
  s.start(`Adding ${delta.join(", ")}`);
  let result;
  try {
    result = compose({
      selection: { projectName: pm.name, outDir: dir, apps: pm.apps, modules: delta },
      registry,
      mode: "add",
    });
  } catch (err) {
    s.stop("Failed");
    log.error((err as Error).message);
    process.exit(1);
  }
  s.stop(`Wired in ${delta.length} component(s)`);

  writeProjectManifest(dir, { ...pm, modules: resolved.modules });

  const reinstall: string[] = [];
  if (pm.apps.some((a) => a === "web" || a === "mobile")) reinstall.push("pnpm install");
  if (pm.apps.includes("server")) reinstall.push("cd apps/server && uv sync && uv run python manage.py migrate");
  if (reinstall.length) note(reinstall.join("\n"), "Install new deps");
  if (result.notes.length) note(result.notes.join("\n"), "Notes");
  outro(pc.green("Done."));
}
