import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { intro, log, outro } from "@clack/prompts";
import pc from "picocolors";
import { PartweaveError } from "../errors.js";
import { readProjectManifest } from "../projectmanifest.js";
import { APPS, type AppName, type Manifest, type TargetName } from "../types.js";

export interface ExtractFlags {
  dir?: string;
  from: string; // Comma-separated paths
}

/**
 * `partweave extract <id> --from <paths...>`
 * Extracts local features from a generated project into a reusable module format.
 */
export async function runExtract(id: string, flags: ExtractFlags): Promise<void> {
  intro(pc.bgMagenta(pc.black(" partweave ")) + pc.dim(" extract"));
  
  const dir = resolve(flags.dir ?? process.cwd());
  const pm = readProjectManifest(dir);
  
  if (!pm) {
    throw new PartweaveError(
      "not-a-project",
      `No partweave project found at ${dir} (missing .partweave/manifest.json). ` +
        `Run this from inside a generated project.`,
      { dir },
    );
  }

  if (!id) {
    throw new PartweaveError("usage", "Specify an id for the new module (e.g., `partweave extract email`).");
  }

  if (!flags.from) {
    throw new PartweaveError("usage", "Specify the source paths to extract using --from (e.g., `--from apps/server/email`).");
  }

  const paths = flags.from.split(",").map((p) => p.trim()).filter(Boolean);
  if (paths.length === 0) {
    throw new PartweaveError("usage", "No valid paths provided in --from.");
  }

  const outDir = join(dir, ".partweave", "extracted", id);
  if (existsSync(outDir)) {
    log.warn(`Extraction directory already exists at ${outDir}. Overwriting files...`);
  } else {
    mkdirSync(outDir, { recursive: true });
  }

  const targets = new Set<TargetName>();

  for (const p of paths) {
    const srcPath = resolve(dir, p);
    if (!existsSync(srcPath)) {
      throw new PartweaveError("not-found", `Source path does not exist: ${srcPath}`);
    }

    // Attempt to map from standard app paths to targets
    // e.g. apps/server/email -> server/email
    let targetRelPath = p;
    if (p.startsWith("apps/server/") || p.startsWith("apps\\server\\")) {
      targetRelPath = p.replace(/^apps[/\\]server[/\\]/, "server/");
      targets.add("server");
    } else if (p.startsWith("apps/web/") || p.startsWith("apps\\web\\")) {
      targetRelPath = p.replace(/^apps[/\\]web[/\\]/, "web/");
      targets.add("web");
    } else if (p.startsWith("apps/mobile/") || p.startsWith("apps\\mobile\\")) {
      targetRelPath = p.replace(/^apps[/\\]mobile[/\\]/, "mobile/");
      targets.add("mobile");
    } else {
      targets.add("root");
    }

    const destPath = join(outDir, targetRelPath);
    mkdirSync(dirname(destPath), { recursive: true });
    cpSync(srcPath, destPath, { recursive: true });
    log.info(`Copied ${p} -> ${targetRelPath}`);
  }

  // Generate skeleton module.json
  const manifestPath = join(outDir, "module.json");
  if (!existsSync(manifestPath)) {
    // requiresApps only names apps (server/web/mobile) — not the derived
    // root/shared/api-client targets — so a consumer knows which app toggles
    // this module needs.
    const isApp = (t: TargetName): t is AppName =>
      (APPS as readonly string[]).includes(t);
    const skeleton: Partial<Manifest> = {
      id,
      title: `${id} (Extracted)`,
      description: `Extracted from local project ${pm.name}`,
      targets: Array.from(targets),
      requiresApps: Array.from(targets).filter(isApp),
      wiring: {},
    };
    writeFileSync(manifestPath, JSON.stringify(skeleton, null, 2));
    log.info(`Generated skeleton manifest at module.json`);
  }

  outro(pc.green(`\nSuccessfully extracted '${id}' to .partweave/extracted/${id}/\n\nYou can now copy this folder to the central partweave repository (modules/${id}) and open a PR!`));
}
