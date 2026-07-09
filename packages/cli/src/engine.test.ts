import { describe, expect, it } from "vitest";
import {
  appendEnv,
  injectAtAnchor,
  mergePackageJsonDeps,
  normalizeWorkspaceDeps,
  parseDep,
} from "./inject.js";
import { Registry } from "./registry.js";
import { resolveModules, validateApps } from "./resolve.js";

describe("injectAtAnchor", () => {
  const src = ["INSTALLED = [", "    # <partweave:apps>", "]"].join("\n");

  it("inserts before the anchor with matching indent", () => {
    const { content, inserted } = injectAtAnchor(src, "apps", ['"accounts",']);
    expect(inserted).toBe(1);
    expect(content).toBe(
      ['INSTALLED = [', '    "accounts",', "    # <partweave:apps>", "]"].join("\n"),
    );
  });

  it("is idempotent", () => {
    const once = injectAtAnchor(src, "apps", ['"accounts",']).content;
    const twice = injectAtAnchor(once, "apps", ['"accounts",']);
    expect(twice.inserted).toBe(0);
    expect(twice.content).toBe(once);
  });

  it("throws on a missing anchor", () => {
    expect(() => injectAtAnchor(src, "nope", ["x"])).toThrow(/nope/);
  });
});

describe("dependency merging", () => {
  it("parses scoped and versioned deps", () => {
    expect(parseDep("@app/shared@workspace:*")).toEqual({
      name: "@app/shared",
      version: "workspace:*",
    });
    expect(parseDep("next")).toEqual({ name: "next", version: "latest" });
  });

  it("merges into package.json without clobbering existing", () => {
    const pkg = JSON.stringify({ dependencies: { next: "^14" } });
    const out = JSON.parse(mergePackageJsonDeps(pkg, ["next@^15", "react@^18"]));
    expect(out.dependencies.next).toBe("^14"); // not overwritten
    expect(out.dependencies.react).toBe("^18");
  });

  it("rewrites the workspace protocol to the PM's range", () => {
    // pnpm keeps workspace:*; npm can't parse it and uses a plain * instead.
    expect(normalizeWorkspaceDeps(["@app/shared@workspace:*"], "workspace:*")).toEqual([
      "@app/shared@workspace:*",
    ]);
    expect(normalizeWorkspaceDeps(["@app/shared@workspace:*"], "*")).toEqual([
      "@app/shared@*",
    ]);
    // non-workspace deps pass through untouched under either PM.
    expect(normalizeWorkspaceDeps(["expo-secure-store@~15.0.8"], "*")).toEqual([
      "expo-secure-store@~15.0.8",
    ]);
  });
});

describe("appendEnv", () => {
  it("adds only missing keys", () => {
    const out = appendEnv("A=1\n", { A: "x", B: "2" }, "Section");
    expect(out).toContain("B=2");
    expect(out.match(/A=/g)).toHaveLength(1);
  });
});

describe("resolveModules", () => {
  const registry = new Registry();

  it("pulls transitive requires (example → auth → db-postgres)", () => {
    const { modules, autoAdded } = resolveModules(registry, ["example"]);
    expect(modules).toContain("auth");
    expect(modules).toContain("db-postgres");
    expect(autoAdded).toEqual(expect.arrayContaining(["auth", "db-postgres"]));
  });

  it("rejects a component whose app is missing", () => {
    const { modules } = resolveModules(registry, ["auth"]);
    expect(() => validateApps(registry, modules, ["web"])).toThrow(/server/);
    expect(() => validateApps(registry, modules, ["server"])).not.toThrow();
  });
});
