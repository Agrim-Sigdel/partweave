import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildContext, compose, selectedTargets } from "./compose.js";
import { Registry } from "./registry.js";
import { resolveModules } from "./resolve.js";
import type { Selection } from "./types.js";

// A temp catalog = the real modules/ tree (so _core anchors are real) plus two
// synthetic modules exercising the soft-join: `notifier` provides a capability,
// `auditlog` enhances it. Both are server-only and coherent (have base wiring),
// so they pass the registry's load-time contract check alongside the real ones.
const realModulesDir = new Registry().modulesDir;
const catalog = mkdtempSync(join(tmpdir(), "pw-enh-catalog-"));
cpSync(realModulesDir, catalog, { recursive: true });

const writeModule = (m: Record<string, unknown>) => {
  const d = join(catalog, m.id as string);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "module.json"), JSON.stringify(m));
};
writeModule({
  id: "notifier",
  title: "Notifier",
  targets: ["server"],
  requiresApps: ["server"],
  provides: "notify",
  wiring: { server: { settings: ["NOTIFIER_ENABLED = True"] } },
});
writeModule({
  id: "auditlog",
  title: "Audit log",
  targets: ["server"],
  requiresApps: ["server"],
  wiring: { server: { settings: ["AUDITLOG_ENABLED = True"] } },
  // Soft-join: only applied when a `notify` provider is also installed.
  enhances: { notify: { server: { settings: ["AUDITLOG_NOTIFY = True  # soft-join"] } } },
});

const registry = new Registry(catalog);
const dirs: string[] = [catalog];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const SOFT = "AUDITLOG_NOTIFY = True";
const settingsOf = (dir: string) =>
  readFileSync(join(dir, "apps/server/config/settings.py"), "utf8");
const occurrences = (s: string, sub: string) => s.split(sub).length - 1;

const sel = (dir: string, modules: string[]): Selection => ({
  projectName: "enh",
  outDir: dir,
  apps: ["server"],
  modules,
  jsPm: "pnpm",
  pyPm: "uv",
});

/** Fresh `create` with the given modules; returns the project dir. */
const createProject = (modules: string[]): string => {
  const dir = mkdtempSync(join(tmpdir(), "pw-enh-"));
  dirs.push(dir);
  const s = sel(dir, resolveModules(registry, modules).modules);
  const targets = selectedTargets(buildContext(s));
  compose({ selection: s, registry, scaffoldTargets: targets, wireTargets: targets, rootFiles: "all" });
  return dir;
};

/** Mirror `add`-module: wire only the delta, but drive enhancements off the full set. */
const addModules = (dir: string, existing: string[], add: string[]): void => {
  const resolved = resolveModules(registry, [...existing, ...add]);
  const delta = resolved.modules.filter((id) => !existing.includes(id));
  const wireTargets = selectedTargets(buildContext(sel(dir, existing)));
  compose({
    selection: sel(dir, delta),
    registry,
    scaffoldTargets: new Set(),
    wireTargets,
    rootFiles: "none",
    contextModuleIds: resolved.modules,
  });
};

describe("enhances soft-joins", () => {
  it("stays dormant when the capability is absent (base wiring still applies)", () => {
    const dir = createProject(["auditlog"]);
    expect(settingsOf(dir)).toContain("AUDITLOG_ENABLED = True");
    expect(settingsOf(dir)).not.toContain(SOFT);
  });

  it("applies when both are created together", () => {
    const dir = createProject(["auditlog", "notifier"]);
    expect(settingsOf(dir)).toContain(SOFT);
  });

  it("converges: create provider, then add enhancer", () => {
    const dir = createProject(["notifier"]);
    expect(settingsOf(dir)).not.toContain(SOFT);
    addModules(dir, ["notifier"], ["auditlog"]);
    expect(settingsOf(dir)).toContain(SOFT);
  });

  it("converges: create enhancer, then add provider (the order-independence case)", () => {
    const dir = createProject(["auditlog"]);
    expect(settingsOf(dir)).not.toContain(SOFT);
    addModules(dir, ["auditlog"], ["notifier"]);
    expect(settingsOf(dir)).toContain(SOFT);
  });

  it("is idempotent: the soft-join line appears exactly once and re-adds are no-ops", () => {
    const dir = createProject(["auditlog", "notifier"]);
    expect(occurrences(settingsOf(dir), SOFT)).toBe(1);
    addModules(dir, ["auditlog", "notifier"], ["auditlog"]);
    expect(occurrences(settingsOf(dir), SOFT)).toBe(1);
  });
});
