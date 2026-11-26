import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { serializeCatalog } from "./catalog.js";
import { buildContext, compose, findMissingAnchors, selectedTargets } from "./compose.js";
import { PartweaveError } from "./errors.js";
import { Registry } from "./registry.js";
import { resolveModules, validateApps } from "./resolve.js";
import { APPS, type AppName, type Selection } from "./types.js";

const registry = new Registry();
const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function scaffold(apps: AppName[], modules: string[], jsPm: "pnpm" | "npm" = "pnpm") {
  const outDir = mkdtempSync(join(tmpdir(), "pw-catalog-"));
  dirs.push(outDir);
  const selection: Selection = { projectName: "catalog-test", outDir, apps, modules, jsPm };
  const targets = selectedTargets(buildContext(selection));
  compose({ selection, registry, scaffoldTargets: targets, wireTargets: targets, rootFiles: "all" });
  return { outDir, targets };
}

describe("selectable catalog", () => {
  it("keeps unfinished designs out of discovery and dependency resolution", () => {
    const ids = serializeCatalog(registry).modules.map((m) => m.id);
    for (const id of ["rbac", "rate-limit", "audit-log", "workflow-engine"]) {
      expect(ids).not.toContain(id);
      expect(() => resolveModules(registry, [id])).toThrow(/Unknown module/);
    }
  });

  for (const mod of registry.features()) {
    // Exercise every supported app subset, so a module cannot depend silently
    // on another client app being present. Runtime checks live in check-catalog.mjs.
    const modules = resolveModules(registry, [mod.manifest.id]).modules;
    const supported: AppName[][] = [];
    for (let mask = 1; mask < 1 << APPS.length; mask++) {
      const apps = APPS.filter((_, index) => mask & (1 << index));
      try {
        validateApps(registry, modules, apps);
        supported.push(apps);
      } catch (error) {
        if (!(error instanceof PartweaveError) || error.kind !== "missing-app") throw error;
      }
    }
    it(`${mod.manifest.id} supports at least one app selection`, () => {
      expect(supported.length).toBeGreaterThan(0);
    });
    for (const apps of supported) {
      for (const pm of ["pnpm", "npm"] as const) {
        it(`${mod.manifest.id}: ${apps.join("+")} (${pm}) composes with intact wiring`, () => {
          const { outDir, targets } = scaffold(apps, modules, pm);
          expect(findMissingAnchors(outDir, targets, modules.map((id) => registry.require(id)))).toEqual([]);
        });
      }
    }
  }

  it("feedback ships a reachable route, navigation, API configuration and a migration without auth", () => {
    const { outDir } = scaffold([...APPS], resolveModules(registry, ["feedback"]).modules);
    expect(existsSync(join(outDir, "apps/server/accounts"))).toBe(false);
    expect(existsSync(join(outDir, "apps/server/feedback/migrations/0001_initial.py"))).toBe(true);
    expect(existsSync(join(outDir, "apps/web/app/feedback/page.tsx"))).toBe(true);
    expect(existsSync(join(outDir, "apps/web/src/app/feedback/page.tsx"))).toBe(false);
    for (const app of ["web", "mobile"]) {
      expect(existsSync(join(outDir, `apps/${app}/src/lib/config.ts`))).toBe(true);
      expect(readFileSync(join(outDir, `apps/${app}/src/nav.ts`), "utf8")).toContain('href: "/feedback"');
    }
  });
});
