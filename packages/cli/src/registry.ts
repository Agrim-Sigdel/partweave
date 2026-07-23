import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { checkCoherence, nearestId } from "./contract.js";
import { PartweaveError } from "./errors.js";
import { findModulesDir } from "./paths.js";
import { ManifestSchema, type Module } from "./types.js";

/**
 * Loads every module manifest from the catalog. A "module" is any directory
 * under modules/ (except `_core`) that contains a `module.json`.
 */
export class Registry {
  readonly modulesDir: string;
  private readonly byId = new Map<string, Module>();

  constructor(modulesDir = findModulesDir()) {
    this.modulesDir = modulesDir;
    this.load();
  }

  private load(): void {
    for (const name of readdirSync(this.modulesDir)) {
      if (name === "_core" || name.startsWith(".")) continue;
      const dir = join(this.modulesDir, name);
      if (!statSync(dir).isDirectory()) continue;
      const manifestPath = join(dir, "module.json");
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(manifestPath, "utf8"));
      } catch {
        throw new Error(`Module "${name}" is missing a valid module.json`);
      }
      const parsed = ManifestSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(
          `Invalid module.json for "${name}":\n${parsed.error.toString()}`,
        );
      }
      if (parsed.data.id !== name) {
        throw new Error(
          `Module dir "${name}" does not match manifest id "${parsed.data.id}"`,
        );
      }
      let changelog: Array<{ version: string; changes: string[] }> | undefined = undefined;
      const changelogPath = join(dir, "CHANGELOG.md");
      if (existsSync(changelogPath)) {
        try {
          const content = readFileSync(changelogPath, "utf8");
          const lines = content.split('\n');
          changelog = [];
          let currentVersion = "";
          let currentChanges: string[] = [];
          for (const line of lines) {
            if (line.startsWith("## [")) {
              if (currentVersion) changelog.push({ version: currentVersion, changes: currentChanges });
              currentVersion = line.replace("## [", "").split("]")[0] || "Unreleased";
              currentChanges = [];
            } else if (line.startsWith("- ") && currentVersion) {
              currentChanges.push(line.slice(2).trim());
            }
          }
          if (currentVersion) changelog.push({ version: currentVersion, changes: currentChanges });
        } catch {}
      }
      this.byId.set(parsed.data.id, { manifest: parsed.data, dir, changelog });
    }

    // Second pass: coherence. The schema proves each manifest is well-typed;
    // this proves it's *meaningful* (see contract.ts). It runs after every
    // module is loaded so rules that span modules (e.g. requiresApps derivable
    // through the `requires` closure) can resolve against the full catalog.
    for (const mod of this.byId.values()) {
      const problems = checkCoherence(mod, this.byId);
      if (problems.length > 0) {
        throw new Error(
          `Incoherent module "${mod.manifest.id}":\n` +
            problems.map((p) => `  - ${p}`).join("\n"),
        );
      }
    }
  }

  get(id: string): Module | undefined {
    return this.byId.get(id);
  }

  require(id: string): Module {
    const m = this.byId.get(id);
    if (!m) {
      const suggestion = nearestId(id, this.byId.keys());
      const message = suggestion
        ? `Unknown module "${id}" — did you mean "${suggestion}"?`
        : `Unknown module: "${id}"`;
      throw new PartweaveError("unknown-module", message, {
        id,
        ...(suggestion ? { suggestion } : {}),
      });
    }
    return m;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  all(): Module[] {
    return [...this.byId.values()];
  }

  /** Feature modules (not app-kind), sorted for stable display. */
  features(): Module[] {
    return this.all()
      .filter((m) => m.manifest.kind === "feature")
      .sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
  }
}
