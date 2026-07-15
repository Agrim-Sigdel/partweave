import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildContext, compose, findMissingAnchors, selectedTargets } from "./compose.js";
import { PartweaveError } from "./errors.js";
import {
  appendEnv,
  higherVersion,
  injectAtAnchor,
  mergePackageJsonDeps,
  normalizeWorkspaceDeps,
  parseDep,
  pyDepName,
} from "./inject.js";
import { Registry } from "./registry.js";
import { resolveModules, validateApps } from "./resolve.js";
import type { Selection } from "./types.js";

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

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

  it("skips a line already present in the anchor's block (pre-existing, not just re-injected)", () => {
    // A line the _core scaffold already ships must not be duplicated by wiring.
    const withExisting = [
      "INSTALLED = [",
      '    "django.contrib.admin",',
      "    # <partweave:apps>",
      "]",
    ].join("\n");
    const { content, inserted } = injectAtAnchor(withExisting, "apps", ['"django.contrib.admin",']);
    expect(inserted).toBe(0);
    expect(content).toBe(withExisting);
  });

  it("dedups within the anchor's block, not across the whole file", () => {
    // The same line legitimately needed under two different anchors must be
    // inserted at BOTH — the old whole-file dedup silently dropped the second.
    const two = [
      "A = [",
      "    # <partweave:a>",
      "]",
      "",
      "B = [",
      "    # <partweave:b>",
      "]",
    ].join("\n");
    const step1 = injectAtAnchor(two, "a", ['"x",']).content;
    const step2 = injectAtAnchor(step1, "b", ['"x",']);
    expect(step2.inserted).toBe(1);
    expect(count(step2.content, /"x",/g)).toBe(2);
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

  it("merges into package.json, keeping the higher version (semver-max)", () => {
    const pkg = JSON.stringify({ dependencies: { next: "^14", react: "^19" } });
    const out = JSON.parse(mergePackageJsonDeps(pkg, ["next@^15", "react@^18", "zod@^3"]));
    expect(out.dependencies.next).toBe("^15"); // upgraded to the higher range
    expect(out.dependencies.react).toBe("^19"); // a lower incoming range never downgrades
    expect(out.dependencies.zod).toBe("^3"); // new dep added
  });

  it("semver-max: keeps the higher range, never downgrades, ignores unparseable", () => {
    expect(higherVersion("^14", "^15")).toBe("^15");
    expect(higherVersion("^19", "^18")).toBe("^19");
    expect(higherVersion(">=3.2", ">=3.10")).toBe(">=3.10");
    expect(higherVersion("workspace:*", "^1")).toBe("workspace:*"); // unparseable → keep existing
  });

  it("extracts base python distribution names (drops extras/specifiers)", () => {
    expect(pyDepName('"psycopg[binary]>=3.2"')).toBe("psycopg");
    expect(pyDepName("Django>=5.1")).toBe("django");
    expect(pyDepName("boto3")).toBe("boto3");
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

  it("orders every module after its requires (deterministic topological order)", () => {
    const { modules } = resolveModules(registry, ["example", "storage", "docker"]);
    const pos = new Map(modules.map((m, i) => [m, i]));
    for (const id of modules) {
      for (const dep of registry.require(id).manifest.requires) {
        expect(pos.get(dep)!, `${dep} must precede ${id}`).toBeLessThan(pos.get(id)!);
      }
    }
  });

  it("is order-independent: same input in any order yields the same result", () => {
    const a = resolveModules(registry, ["example", "storage"]).modules;
    const b = resolveModules(registry, ["storage", "example"]).modules;
    expect(a).toEqual(b);
  });
});

describe("create-then-add is idempotent (no double-wiring)", () => {
  const registry = new Registry();
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

  const sel = (dir: string, modules: string[]): Selection => ({
    projectName: "e2e",
    outDir: dir,
    apps: ["server"],
    modules,
    jsPm: "pnpm",
    pyPm: "uv",
  });

  it("adds a component to an existing project without duplicating prior wiring", () => {
    const dir = mkdtempSync(join(tmpdir(), "pw-e2e-"));
    dirs.push(dir);
    const settings = join(dir, "apps/server/config/settings.py");
    const pyproject = join(dir, "apps/server/pyproject.toml");

    // 1. create: server + auth (auth pulls db-postgres transitively)
    const create = sel(dir, resolveModules(registry, ["auth"]).modules);
    const targets = selectedTargets(buildContext(create));
    compose({ selection: create, registry, scaffoldTargets: targets, wireTargets: targets, rootFiles: "all" });
    const afterCreate = readFileSync(settings, "utf8");
    expect(count(afterCreate, /"accounts",/g)).toBe(1);
    expect(afterCreate).not.toContain("STORAGE_BACKEND");

    // 2. add storage (add-module mode: no re-scaffold, wire server, no root files)
    const add = sel(dir, resolveModules(registry, ["auth", "storage"]).modules);
    compose({ selection: add, registry, scaffoldTargets: new Set(), wireTargets: selectedTargets(buildContext(add)), rootFiles: "none" });
    const afterAdd = readFileSync(settings, "utf8");
    expect(count(afterAdd, /"accounts",/g)).toBe(1); // prior wiring not duplicated
    expect(count(afterAdd, /STORAGE_BACKEND = env/g)).toBe(1); // new wiring applied once
    // deps merged by name, once each
    expect(count(readFileSync(pyproject, "utf8"), /djangorestframework-simplejwt/g)).toBe(1);
    expect(count(readFileSync(pyproject, "utf8"), /boto3/g)).toBe(1);

    // 3. re-run the same add: a no-op, byte-for-byte
    const before = readFileSync(settings, "utf8");
    compose({ selection: add, registry, scaffoldTargets: new Set(), wireTargets: selectedTargets(buildContext(add)), rootFiles: "none" });
    expect(readFileSync(settings, "utf8")).toBe(before);
  });
});

describe("create-then-add-app scaffolds and re-wires without clobbering edits (F4/S0.5)", () => {
  const registry = new Registry();
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

  const sel = (dir: string, apps: ("server" | "web" | "mobile")[], modules: string[]): Selection => ({
    projectName: "e2e",
    outDir: dir,
    apps,
    modules,
    jsPm: "pnpm",
    pyPm: "uv",
  });

  // Mirror the add-app path in commands/add.ts: scaffold only the *new* targets,
  // wire them, and regenerate structural root files in preserve mode.
  const addApp = (dir: string, oldApps: ("server" | "web" | "mobile")[], newApps: ("server" | "web" | "mobile")[], modules: string[]) => {
    const oldTargets = selectedTargets(buildContext(sel(dir, oldApps, modules)));
    const newTargets = selectedTargets(buildContext(sel(dir, newApps, modules)));
    const scaffold = new Set([...newTargets].filter((t) => !oldTargets.has(t)));
    return compose({
      selection: sel(dir, newApps, modules),
      registry,
      scaffoldTargets: scaffold,
      wireTargets: scaffold,
      rootFiles: "structural",
      previousApps: oldApps,
    });
  };

  it("adds `web` to a server+auth project: web scaffolded, workspace membership updated once", () => {
    const dir = mkdtempSync(join(tmpdir(), "pw-addapp-"));
    dirs.push(dir);
    const modules = resolveModules(registry, ["auth"]).modules;

    // create: server-only + auth
    const create = sel(dir, ["server"], modules);
    const targets = selectedTargets(buildContext(create));
    compose({ selection: create, registry, scaffoldTargets: targets, wireTargets: targets, rootFiles: "all" });
    expect(existsSync(join(dir, "apps/web"))).toBe(false);

    // add web
    addApp(dir, ["server"], ["server", "web"], modules);
    // web app scaffolded, incl. auth's web-side wiring (login page/provider)
    expect(existsSync(join(dir, "apps/web"))).toBe(true);
    // workspace now lists the web app exactly once
    const ws = readFileSync(join(dir, "pnpm-workspace.yaml"), "utf8");
    expect(count(ws, /apps\/web/g)).toBe(1);
  });

  it("keeps a hand-edited root file and drops the regenerated version as a .partweave-new sidecar", () => {
    const dir = mkdtempSync(join(tmpdir(), "pw-preserve-"));
    dirs.push(dir);
    const modules = resolveModules(registry, ["auth"]).modules;

    const create = sel(dir, ["server"], modules);
    const targets = selectedTargets(buildContext(create));
    compose({ selection: create, registry, scaffoldTargets: targets, wireTargets: targets, rootFiles: "all" });

    // The user hand-edits the Makefile.
    const makefile = join(dir, "Makefile");
    const edited = readFileSync(makefile, "utf8") + "\n# my custom target\ndeploy:\n\t./deploy.sh\n";
    writeFileSync(makefile, edited);

    // add web → structural root files regenerate in preserve mode
    const result = addApp(dir, ["server"], ["server", "web"], modules);

    // the user's Makefile is untouched…
    expect(readFileSync(makefile, "utf8")).toBe(edited);
    // …and the regenerated version sits beside it for reconciliation…
    expect(existsSync(`${makefile}.partweave-new`)).toBe(true);
    // …with a note telling the user what happened.
    expect(result.notes.some((n) => n.includes("Makefile") && n.includes(".partweave-new"))).toBe(true);
  });
});

describe("lost anchors abort atomically with a fix-it list (anchor durability)", () => {
  const registry = new Registry();
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

  const sel = (dir: string, modules: string[]): Selection => ({
    projectName: "anchors",
    outDir: dir,
    apps: ["server"],
    modules,
    jsPm: "pnpm",
    pyPm: "uv",
  });

  const scaffoldServer = (): string => {
    const dir = mkdtempSync(join(tmpdir(), "pw-anchor-"));
    dirs.push(dir);
    const create = sel(dir, []);
    const targets = selectedTargets(buildContext(create));
    compose({ selection: create, registry, scaffoldTargets: targets, wireTargets: targets, rootFiles: "all" });
    return dir;
  };

  it("finds no missing anchors in a fresh scaffold", () => {
    const dir = scaffoldServer();
    const add = sel(dir, ["storage"]);
    const modules = add.modules.map((id) => registry.require(id));
    expect(findMissingAnchors(dir, selectedTargets(buildContext(add)), modules)).toEqual([]);
  });

  it("reports a user-deleted anchor, and the failed add modifies nothing", () => {
    const dir = scaffoldServer();
    const settings = join(dir, "apps/server/config/settings.py");
    const urls = join(dir, "apps/server/config/urls.py");

    // simulate the user deleting the settings anchor from their settings.py
    writeFileSync(
      settings,
      readFileSync(settings, "utf8").replace(/^.*<partweave:settings>.*\n/m, ""),
    );
    const settingsBefore = readFileSync(settings, "utf8");
    const urlsBefore = readFileSync(urls, "utf8");

    const add = sel(dir, ["storage"]);
    const modules = add.modules.map((id) => registry.require(id));
    const targets = selectedTargets(buildContext(add));

    // doctor's view: the lost anchor is reported with the module that needs it
    const missing = findMissingAnchors(dir, targets, modules);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ module: "storage", target: "server", anchor: "settings" });
    expect(missing[0].lines.length).toBeGreaterThan(0);

    // the add aborts as a typed error BEFORE copying or wiring anything
    try {
      compose({ selection: add, registry, scaffoldTargets: new Set(), wireTargets: targets, rootFiles: "none" });
      expect.unreachable();
    } catch (err) {
      const pe = err as PartweaveError;
      expect(pe.kind).toBe("missing-anchor");
      expect(pe.exitCode).toBe(12);
      expect(pe.message).toMatch(/<partweave:settings>/);
      expect(pe.details?.missing).toHaveLength(1);
    }
    // atomic: no partial wiring, no module files copied
    expect(readFileSync(settings, "utf8")).toBe(settingsBefore);
    expect(readFileSync(urls, "utf8")).toBe(urlsBefore);
    expect(existsSync(join(dir, "apps/server/storage"))).toBe(false);
  });
});
