import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkCoherence, levenshtein, nearestId } from "./contract.js";
import { PartweaveError } from "./errors.js";
import { Registry } from "./registry.js";
import { ManifestSchema, type Manifest, type Module } from "./types.js";

// ---------------------------------------------------------------------------
// Fixture helpers: build throwaway module dirs on disk, mirroring the temp-
// Registry pattern in engine.test.ts / cli.test.ts (mkdtempSync + a `mod()`
// helper) rather than editing those files.
// ---------------------------------------------------------------------------

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A fresh empty modules/ catalog root. */
function catalogDir(): string {
  const d = mkdtempSync(join(tmpdir(), "pw-contract-"));
  dirs.push(d);
  return d;
}

/** Fill schema defaults so a partial manifest becomes a full `Manifest`. */
function manifest(partial: Record<string, unknown>): Manifest {
  return ManifestSchema.parse(partial);
}

/**
 * Write `<root>/<id>/module.json` (+ any `targetDirs` subdirs) and return the
 * loaded Module, exactly as Registry would hold it.
 */
function mod(
  root: string,
  partial: Record<string, unknown>,
  targetDirs: string[] = [],
): Module {
  const m = manifest(partial);
  const dir = join(root, m.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "module.json"), JSON.stringify(m, null, 2));
  for (const t of targetDirs) mkdirSync(join(dir, t), { recursive: true });
  return { manifest: m, dir };
}

// ---------------------------------------------------------------------------
// checkCoherence — the three coherence rules
// ---------------------------------------------------------------------------

describe("checkCoherence — rule 1: wiring must reference a declared target", () => {
  it("accepts wiring for a declared target", () => {
    const root = catalogDir();
    const m = mod(root, {
      id: "ok",
      title: "ok",
      targets: ["server"],
      wiring: { server: { settings: ["X = 1"] } },
    });
    expect(checkCoherence(m)).toEqual([]);
  });

  it("rejects wiring for a target not in `targets`", () => {
    const root = catalogDir();
    const m = mod(root, {
      id: "stray",
      title: "stray",
      targets: ["server"],
      // server is backed by a dir (so only the stray `web` wiring is a problem)
      wiring: { web: { providers: ["Foo,"] } },
    }, ["server"]);
    const problems = checkCoherence(m);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/wiring for target "web"/);
    expect(problems[0]).toContain("stray");
  });
});

describe("checkCoherence — rule 2: no dead targets", () => {
  it("rejects a declared target with neither files nor wiring", () => {
    const root = catalogDir();
    const m = mod(root, { id: "dead", title: "dead", targets: ["server", "web"] }, ["server"]);
    const problems = checkCoherence(m);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/target "web" is dead/);
  });

  it("accepts a target backed by a template dir", () => {
    const root = catalogDir();
    const m = mod(root, { id: "hasdir", title: "hasdir", targets: ["web"] }, ["web"]);
    expect(checkCoherence(m)).toEqual([]);
  });

  it("accepts a target backed only by wiring (no dir)", () => {
    const root = catalogDir();
    const m = mod(root, {
      id: "wireonly",
      title: "wireonly",
      targets: ["server"],
      wiring: { server: { deps: ["boto3>=1.35"] } },
    });
    expect(checkCoherence(m)).toEqual([]);
  });

  it("exempts the `root` target (codegen shell, e.g. the ci marker)", () => {
    const root = catalogDir();
    // No root/ dir, no wiring — legal for a root-only codegen module.
    const m = mod(root, { id: "marker", title: "marker", targets: ["root"] });
    expect(checkCoherence(m)).toEqual([]);
  });
});

describe("checkCoherence — rule 3: requiresApps must be derivable", () => {
  it("accepts requiresApps covered by the module's own targets", () => {
    const root = catalogDir();
    const m = mod(root, {
      id: "srv",
      title: "srv",
      targets: ["server"],
      requiresApps: ["server"],
      wiring: { server: { deps: ["x"] } },
    });
    expect(checkCoherence(m)).toEqual([]);
  });

  it("rejects requiresApps naming an app the module can't reach", () => {
    const root = catalogDir();
    const m = mod(
      root,
      { id: "lonely", title: "lonely", targets: ["web"], requiresApps: ["server"] },
      ["web"],
    );
    const problems = checkCoherence(m);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/requiresApps includes "server"/);
  });

  it("accepts requiresApps reachable through the `requires` closure (example → auth)", () => {
    const root = catalogDir();
    const auth = mod(
      root,
      { id: "auth", title: "auth", targets: ["server", "web"] },
      ["server", "web"],
    );
    const example = mod(
      root,
      {
        id: "example",
        title: "example",
        targets: ["web"],
        requires: ["auth"],
        requiresApps: ["server"],
      },
      ["web"],
    );
    const catalog = new Map<string, Module>([
      [auth.manifest.id, auth],
      [example.manifest.id, example],
    ]);
    // Without the catalog, server isn't derivable from example's own targets…
    expect(checkCoherence(example)).toHaveLength(1);
    // …but through `requires: ["auth"]` it is.
    expect(checkCoherence(example, catalog)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Registry integration: load() runs the coherence pass and throws.
// ---------------------------------------------------------------------------

describe("Registry.load enforces coherence", () => {
  it("loads a coherent catalog", () => {
    const root = catalogDir();
    mod(root, {
      id: "good",
      title: "good",
      targets: ["server"],
      wiring: { server: { deps: ["x"] } },
    });
    const reg = new Registry(root);
    expect(reg.has("good")).toBe(true);
  });

  it("throws (plain Error) naming the module and the problem", () => {
    const root = catalogDir();
    mod(root, { id: "broken", title: "broken", targets: ["server", "mobile"] }, ["server"]);
    expect(() => new Registry(root)).toThrow(/Incoherent module "broken"[\s\S]*target "mobile" is dead/);
  });
});

// ---------------------------------------------------------------------------
// did-you-mean: Registry.require suggests the nearest catalog id.
// ---------------------------------------------------------------------------

describe("Registry.require did-you-mean", () => {
  function reg(): Registry {
    const root = catalogDir();
    for (const id of ["storage", "auth", "docker"]) {
      mod(root, { id, title: id, targets: ["server"], wiring: { server: { deps: ["x"] } } });
    }
    return new Registry(root);
  }

  it('suggests the nearest id: "strage" → "storage"', () => {
    try {
      reg().require("strage");
      expect.unreachable();
    } catch (err) {
      const pe = err as PartweaveError;
      expect(pe.kind).toBe("unknown-module");
      expect(pe.message).toBe('Unknown module "strage" — did you mean "storage"?');
      expect(pe.details).toMatchObject({ id: "strage", suggestion: "storage" });
    }
  });

  it("omits a suggestion when nothing is close", () => {
    try {
      reg().require("zzzzzzzz");
      expect.unreachable();
    } catch (err) {
      const pe = err as PartweaveError;
      expect(pe.kind).toBe("unknown-module");
      expect(pe.message).toBe('Unknown module: "zzzzzzzz"');
      expect(pe.details?.suggestion).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// string-distance helpers
// ---------------------------------------------------------------------------

describe("levenshtein", () => {
  it("is 0 for identical strings", () => {
    expect(levenshtein("storage", "storage")).toBe(0);
  });
  it("counts a single insertion", () => {
    expect(levenshtein("strage", "storage")).toBe(1);
  });
  it("counts substitutions and handles empties", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
  });
});

describe("nearestId", () => {
  const ids = ["storage", "auth", "db-postgres", "docker"];
  it("returns the closest plausible match", () => {
    expect(nearestId("strage", ids)).toBe("storage");
    expect(nearestId("dockr", ids)).toBe("docker");
  });
  it("returns undefined when nothing is within threshold", () => {
    expect(nearestId("xyzzy", ids)).toBeUndefined();
  });
});
