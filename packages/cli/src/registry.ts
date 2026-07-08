import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
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
      this.byId.set(parsed.data.id, { manifest: parsed.data, dir });
    }
  }

  get(id: string): Module | undefined {
    return this.byId.get(id);
  }

  require(id: string): Module {
    const m = this.byId.get(id);
    if (!m) throw new Error(`Unknown module: "${id}"`);
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
