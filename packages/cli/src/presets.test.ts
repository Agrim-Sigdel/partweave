import { describe, expect, it } from "vitest";
import { PRESETS, resolvePreset } from "./presets.js";
import { Registry } from "./registry.js";
import { resolveModules, validateApps } from "./resolve.js";

describe("vertical presets", () => {
  it("resolves every preset cleanly against the module catalog", () => {
    const registry = new Registry();
    for (const key of Object.keys(PRESETS)) {
      const preset = resolvePreset(key);
      const resolved = resolveModules(registry, preset.modules);
      expect(() => validateApps(registry, resolved.modules, preset.apps)).not.toThrow();
      expect(resolved.modules).toContain("vertical-looks");
    }
  });

  it("rejects unknown preset names with usage PartweaveError", () => {
    expect(() => resolvePreset("nonexistent")).toThrow(/Unknown preset/);
  });
});
