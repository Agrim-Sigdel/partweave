import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Registry } from "./registry.js";
import { serializeCatalog } from "./catalog.js";

// ---------------------------------------------------------------------------
// Fixture helper: a throwaway modules/ dir, mirroring contract.test.ts's
// `mod()` pattern, extended to optionally drop a CHANGELOG.md alongside the
// manifest — that's what Registry.load() parses into `Module.changelog`.
// ---------------------------------------------------------------------------

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function catalogDir(): string {
  const d = mkdtempSync(join(tmpdir(), "pw-registry-"));
  dirs.push(d);
  return d;
}

function writeModule(
  root: string,
  manifest: Record<string, unknown>,
  changelog?: string,
): void {
  const dir = join(root, manifest.id as string);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "module.json"), JSON.stringify(manifest));
  // Every declared target needs some wiring or the load-time coherence check
  // rejects it as a "dead" target.
  if (changelog !== undefined) writeFileSync(join(dir, "CHANGELOG.md"), changelog);
}

describe("Registry — CHANGELOG.md parsing", () => {
  it("parses multiple version sections into {version, changes[]}", () => {
    const root = catalogDir();
    writeModule(
      root,
      { id: "m", title: "M", targets: ["server"], wiring: { server: { settings: ["X = 1"] } } },
      [
        "# Changelog - m",
        "",
        "## [0.2.0]",
        "### Added",
        "- Second feature.",
        "- Another line.",
        "",
        "## [0.1.0]",
        "### Added",
        "- First feature.",
        "",
      ].join("\n"),
    );
    const registry = new Registry(root);
    expect(registry.get("m")!.changelog).toEqual([
      { version: "0.2.0", changes: ["Second feature.", "Another line."] },
      { version: "0.1.0", changes: ["First feature."] },
    ]);
  });

  it("ignores subheaders (### Added) and bullets before any version header", () => {
    const root = catalogDir();
    writeModule(
      root,
      { id: "m", title: "M", targets: ["server"], wiring: { server: { settings: ["X = 1"] } } },
      ["- orphan bullet, no version yet", "", "## [Unreleased]", "- real change"].join("\n"),
    );
    const registry = new Registry(root);
    expect(registry.get("m")!.changelog).toEqual([
      { version: "Unreleased", changes: ["real change"] },
    ]);
  });

  it("leaves changelog undefined when there is no CHANGELOG.md", () => {
    const root = catalogDir();
    writeModule(root, {
      id: "m",
      title: "M",
      targets: ["server"],
      wiring: { server: { settings: ["X = 1"] } },
    });
    const registry = new Registry(root);
    expect(registry.get("m")!.changelog).toBeUndefined();
  });

  it("matches the real Keep-a-Changelog-style format used by modules/rbac, rate-limit, audit-log", () => {
    const registry = new Registry();
    for (const id of ["rbac", "rate-limit", "audit-log"]) {
      const mod = registry.get(id);
      expect(mod, `module "${id}" should exist in the real catalog`).toBeDefined();
      expect(mod!.changelog).toEqual([
        {
          version: "Unreleased",
          changes: ["Initial `SPEC.md` drafted.", "Module manifest `module.json` created."],
        },
      ]);
    }
  });
});

describe("Manifest — options field", () => {
  it("defaults to {} when a module declares no options", () => {
    const root = catalogDir();
    writeModule(root, {
      id: "m",
      title: "M",
      targets: ["server"],
      wiring: { server: { settings: ["X = 1"] } },
    });
    const registry = new Registry(root);
    expect(registry.get("m")!.manifest.options).toEqual({});
  });

  it("round-trips declared boolean/string options", () => {
    const root = catalogDir();
    writeModule(root, {
      id: "m",
      title: "M",
      targets: ["server"],
      wiring: { server: { settings: ["X = 1"] } },
      options: {
        strict: { type: "boolean", default: true, description: "Enforce strict mode" },
        provider: { type: "string", default: "local" },
      },
    });
    const registry = new Registry(root);
    expect(registry.get("m")!.manifest.options).toEqual({
      strict: { type: "boolean", default: true, description: "Enforce strict mode" },
      provider: { type: "string", default: "local" },
    });
  });
});

describe("catalog serialization — options and changelog reach the agent-facing catalog", () => {
  it("surfaces per-module options and changelog on CatalogModule", () => {
    const root = catalogDir();
    writeModule(
      root,
      {
        id: "m",
        title: "M",
        targets: ["server"],
        wiring: { server: { settings: ["X = 1"] } },
        options: { strict: { type: "boolean", default: false } },
      },
      "## [1.0.0]\n- Shipped.\n",
    );
    const catalog = serializeCatalog(new Registry(root));
    const m = catalog.modules.find((mod) => mod.id === "m");
    expect(m).toBeDefined();
    expect(m!.options).toEqual({ strict: { type: "boolean", default: false } });
    expect(m!.changelog).toEqual([{ version: "1.0.0", changes: ["Shipped."] }]);
  });

  it("omits changelog (undefined, not null) for modules without one", () => {
    const root = catalogDir();
    writeModule(root, {
      id: "m",
      title: "M",
      targets: ["server"],
      wiring: { server: { settings: ["X = 1"] } },
    });
    const catalog = serializeCatalog(new Registry(root));
    const m = catalog.modules.find((mod) => mod.id === "m");
    expect(m!.changelog).toBeUndefined();
  });
});
