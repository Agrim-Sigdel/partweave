import { describe, expect, it } from "vitest";
import { buildContext } from "./compose.js";
import { jsPmInstallPlan, pyPmInstallPlan } from "./pm.js";
import {
  buildMakefile,
  buildRootPackageJson,
  buildTaskRunner,
} from "./rootgen.js";
import type { Selection } from "./types.js";

const ctx = (over: Partial<Selection>) =>
  buildContext({
    projectName: "demo",
    outDir: "/tmp/demo",
    apps: ["server", "web"],
    modules: [],
    jsPm: "npm",
    pyPm: "pip",
    ...over,
  } as Selection);

describe("buildTaskRunner (cross-platform)", () => {
  it("emits a task map with the selected apps' tasks", () => {
    const src = buildTaskRunner(ctx({ apps: ["server", "web"] }), false);
    for (const t of ["bootstrap()", "dev()", "web()", "server()", "migrate()"]) {
      expect(src).toContain(t);
    }
  });

  it("is shell-free & Windows-safe: no `cd`/`&&` recipes, resolves venv per-platform", () => {
    const src = buildTaskRunner(ctx({ apps: ["server", "web"], pyPm: "pip" }), true);
    // No POSIX-only shell chaining in recipes (JS `&&` operators are fine).
    expect(src).not.toContain("cd apps/server &&");
    expect(src).not.toMatch(/\bcd apps\/server\b/);
    // pip venv python is chosen by platform, not hardcoded to POSIX .venv/bin.
    expect(src).toContain(".venv\\\\Scripts\\\\python.exe");
    expect(src).toContain(".venv/bin/python");
    // uses spawnSync with a cwd option instead of `cd`.
    expect(src).toContain('SERVER = { cwd: "apps/server" }');
  });

  it("uses the project's chosen JS manager, not pnpm, for npm projects", () => {
    const npmSrc = buildTaskRunner(ctx({ apps: ["web"], jsPm: "npm" }), false);
    expect(npmSrc).toContain('run("npm", ["install"])');
    expect(npmSrc).not.toContain("pnpm");

    const pnpmSrc = buildTaskRunner(ctx({ apps: ["web"], jsPm: "pnpm" }), false);
    expect(pnpmSrc).toContain('run("pnpm", ["install"])');
    // pnpm projects self-heal via corepack in the bootstrap preflight.
    expect(pnpmSrc).toContain("corepack");
  });

  it("only includes db:up when Docker is present", () => {
    expect(buildTaskRunner(ctx({ apps: ["server"] }), true)).toContain('"db:up"()');
    expect(buildTaskRunner(ctx({ apps: ["server"] }), false)).not.toContain('"db:up"()');
  });

  it("runs multiple dev servers in parallel, a single one directly", () => {
    expect(buildTaskRunner(ctx({ apps: ["server", "web"] }), false)).toContain("parallel([");
    const single = buildTaskRunner(ctx({ apps: ["web"] }), false);
    expect(single).not.toContain("parallel([");
    expect(single).toContain("dev() { const [c, a, o = {}] =");
  });
});

describe("buildMakefile delegates to the runner", () => {
  it("every recipe just calls node scripts/run.mjs", () => {
    const mk = buildMakefile(ctx({ apps: ["server", "web"] }), true);
    expect(mk).toContain("node scripts/run.mjs bootstrap");
    expect(mk).toContain("node scripts/run.mjs db:up");
    // no raw package-manager commands leak into the Makefile anymore.
    expect(mk).not.toContain("pnpm install");
    expect(mk).not.toContain("cd apps/server");
  });
});

describe("buildRootPackageJson", () => {
  it("emits for a server-only project with a bootstrap script", () => {
    const pkg = JSON.parse(buildRootPackageJson(ctx({ apps: ["server"] }), false)!);
    expect(pkg.scripts.bootstrap).toBe("node scripts/run.mjs bootstrap");
    expect(pkg.scripts.server).toBe("node scripts/run.mjs server");
    // no JS toolchain for a pure-Python project.
    expect(pkg.devDependencies).toBeUndefined();
    expect(pkg.workspaces).toBeUndefined();
  });

  it("keeps npm workspaces / pnpm packageManager for JS projects", () => {
    const npmPkg = JSON.parse(buildRootPackageJson(ctx({ apps: ["web"], jsPm: "npm" }), false)!);
    expect(npmPkg.workspaces).toContain("apps/web");
    const pnpmPkg = JSON.parse(buildRootPackageJson(ctx({ apps: ["web"], jsPm: "pnpm" }), false)!);
    expect(pnpmPkg.packageManager).toMatch(/^pnpm@/);
  });

  it("returns null when there's nothing to run", () => {
    expect(buildRootPackageJson(ctx({ apps: [] }), false)).toBeNull();
  });

  it("silences known-benign deprecated transitive deps for pnpm projects", () => {
    // Mobile drags in the Expo/RN + jsdom@20 chain; web only jsdom@25.
    const both = JSON.parse(
      buildRootPackageJson(ctx({ apps: ["web", "mobile"], jsPm: "pnpm" }), false)!,
    );
    const allow = both.pnpm.allowedDeprecatedVersions;
    expect(allow).toMatchObject({ glob: "7", rimraf: "3", inflight: "1", uuid: "7" });
    expect(allow["whatwg-encoding"]).toBe("2 || 3");

    // web-only sees only whatwg-encoding@3, none of the Expo/RN packages.
    const web = JSON.parse(buildRootPackageJson(ctx({ apps: ["web"], jsPm: "pnpm" }), false)!);
    expect(web.pnpm.allowedDeprecatedVersions).toEqual({ "whatwg-encoding": "3" });

    // npm has no such field; a server-only project has no JS deprecations at all.
    expect(JSON.parse(buildRootPackageJson(ctx({ apps: ["web"], jsPm: "npm" }), false)!).pnpm)
      .toBeUndefined();
    expect(JSON.parse(buildRootPackageJson(ctx({ apps: ["server"] }), false)!).pnpm)
      .toBeUndefined();
  });
});

describe("package-manager install plans", () => {
  it("maps pnpm to corepack and npm to no-op", () => {
    expect(jsPmInstallPlan("pnpm")?.cmd).toBe("corepack");
    expect(jsPmInstallPlan("npm")).toBeNull();
  });

  it("maps uv to its installer and pip to no-op", () => {
    const plan = pyPmInstallPlan("uv");
    expect(plan).not.toBeNull();
    // Unix vs Windows invocation both reference the astral installer.
    expect(plan!.hint).toContain("astral.sh/uv/install");
    expect(pyPmInstallPlan("pip")).toBeNull();
  });
});
