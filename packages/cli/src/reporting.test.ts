import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildContext,
  compose,
  selectedTargets,
  skippedTargetsNote,
  type SkippedTarget,
} from "./compose.js";
import { Registry } from "./registry.js";
import { resolveModules } from "./resolve.js";
import type { AppName, Selection } from "./types.js";

const registry = new Registry();
const tmpDirs: string[] = [];

afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Compose a fresh project (create semantics) into a throwaway dir. */
function composeInto(apps: AppName[], moduleIds: string[]) {
  const outDir = mkdtempSync(join(tmpdir(), "pw-report-"));
  tmpDirs.push(outDir);
  const modules = resolveModules(registry, moduleIds).modules;
  const selection: Selection = {
    projectName: "demo",
    outDir,
    apps,
    modules,
  };
  const targets = selectedTargets(buildContext(selection));
  return compose({
    selection,
    registry,
    scaffoldTargets: targets,
    wireTargets: targets,
    rootFiles: "all",
  });
}

describe("compose target reporting", () => {
  it("records a module's absent targets as skipped (feedback → mobile in a server+web project)", () => {
    // feedback targets [server, web, mobile]; a server+web project has no mobile.
    const result = composeInto(["server", "web"], ["feedback"]);

    expect(result.appliedTargets).toEqual(expect.arrayContaining(["server", "web"]));
    expect(result.appliedTargets).not.toContain("mobile");
    expect(result.skippedTargets).toContainEqual<SkippedTarget>({
      module: "feedback",
      target: "mobile",
    });
    // The present slices are NOT reported as skipped.
    expect(result.skippedTargets).not.toContainEqual({ module: "feedback", target: "server" });
    expect(result.skippedTargets).not.toContainEqual({ module: "feedback", target: "web" });
  });

  it("reports no skips when every declared target is present", () => {
    // With all three apps, feedback's [server, web, mobile] are all present.
    const result = composeInto(["server", "web", "mobile"], ["feedback"]);

    expect(result.skippedTargets.filter((s) => s.module === "feedback")).toHaveLength(0);
    expect(result.appliedTargets).toEqual(expect.arrayContaining(["server", "web", "mobile"]));
  });

  it("appliedTargets is deduped and in COPY_ORDER", () => {
    const result = composeInto(["server", "web", "mobile"], ["feedback"]);
    // no duplicates
    expect(new Set(result.appliedTargets).size).toBe(result.appliedTargets.length);
    // ordering follows root, server, web, mobile, shared, api-client
    const order = ["root", "server", "web", "mobile", "shared", "api-client"];
    const idxs = result.appliedTargets.map((t) => order.indexOf(t));
    expect(idxs).toEqual([...idxs].sort((a, b) => a - b));
  });
});

describe("skippedTargetsNote", () => {
  it("returns null when nothing was skipped", () => {
    expect(skippedTargetsNote([])).toBeNull();
  });

  it("labels app targets 'app not present'", () => {
    expect(skippedTargetsNote([{ module: "feedback", target: "mobile" }])).toBe(
      "skipped: mobile (app not present)",
    );
  });

  it("labels non-app targets 'not present'", () => {
    expect(skippedTargetsNote([{ module: "x", target: "shared" }])).toBe(
      "skipped: shared (not present)",
    );
  });

  it("deduplicates repeated targets across modules", () => {
    const note = skippedTargetsNote([
      { module: "a", target: "mobile" },
      { module: "b", target: "mobile" },
    ]);
    expect(note).toBe("skipped: mobile (app not present)");
  });
});
