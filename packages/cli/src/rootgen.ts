import { randomBytes } from "node:crypto";
import { jsPmProfile, pyPmProfile } from "./pm.js";
import type { Module, RenderContext } from "./types.js";

/**
 * The monorepo shell files that depend on *which* parts were selected are built
 * here in code (rather than copied from a template), so a server-only project
 * never mentions pnpm and a mobile-only project never mentions Postgres. These
 * builders also speak the project's chosen package managers (pnpm/npm, uv/pip).
 */

/** JS/TS workspace member list. */
function jsMembers(ctx: RenderContext): string[] {
  const members: string[] = [];
  if (ctx.hasWeb) members.push("apps/web");
  if (ctx.hasMobile) members.push("apps/mobile");
  if (ctx.hasShared) members.push("packages/shared");
  if (ctx.hasApiClient) members.push("packages/api-client");
  return members;
}

/**
 * pnpm declares workspace members in pnpm-workspace.yaml. npm declares them in
 * package.json instead (see buildRootPackageJson), so this returns null for npm.
 */
export function buildJsWorkspace(ctx: RenderContext): string | null {
  if (!jsPmProfile(ctx.jsPm).usesWorkspaceYaml) return null;
  const members = jsMembers(ctx);
  if (members.length === 0) return null;
  return "packages:\n" + members.map((m) => `  - "${m}"`).join("\n") + "\n";
}

export function buildRootPackageJson(
  ctx: RenderContext,
  hasDocker: boolean,
): string | null {
  const anyJs = ctx.hasWeb || ctx.hasMobile || ctx.hasShared;
  // A pure-Python (server-only) project still gets a root package.json so its
  // cross-platform `npm run <task>` scripts work; it just carries no JS deps.
  if (!anyJs && !ctx.hasServer) return null;
  const pm = jsPmProfile(ctx.jsPm);

  // Every task delegates to the cross-platform runner (scripts/run.mjs), so npm,
  // make, and a bare `node scripts/run.mjs` all drive identical behavior.
  const t = (task: string) => `node scripts/run.mjs ${task}`;
  const scripts: Record<string, string> = { bootstrap: t("bootstrap"), dev: t("dev") };
  if (ctx.hasWeb) scripts["web"] = t("web");
  if (ctx.hasMobile) scripts["mobile"] = t("mobile");
  if (ctx.hasServer) {
    scripts["server"] = t("server");
    scripts["migrate"] = t("migrate");
    scripts["superuser"] = t("superuser");
    if (hasDocker) {
      scripts["db:up"] = t("db:up");
      scripts["db:down"] = t("db:down");
    }
  }
  if (ctx.hasApiClient) scripts["gen:api"] = t("gen:api");
  if (anyJs) scripts["typecheck"] = pm.runAll("typecheck");

  const pkg: Record<string, unknown> = {
    name: ctx.projectSlug,
    version: "0.1.0",
    private: true,
  };
  if (anyJs && pm.packageManagerField) pkg.packageManager = pm.packageManagerField;
  // npm keeps its workspace member list here (pnpm uses pnpm-workspace.yaml).
  if (anyJs && !pm.usesWorkspaceYaml) pkg.workspaces = jsMembers(ctx);
  pkg.scripts = scripts;
  if (anyJs) pkg.devDependencies = { typescript: "^5.7.2" };
  return JSON.stringify(pkg, null, 2) + "\n";
}

/**
 * Cross-platform task runner emitted as `scripts/run.mjs`. It replaces the
 * Unix-only Makefile *logic* with a Node script that works on macOS, Linux, and
 * Windows: every task is `spawnSync`-invoked with structured argv (no shell
 * `&&`/`cd`), the pip venv path resolves per-platform, and `bootstrap`
 * self-heals a missing pnpm (via corepack) or points at the uv installer.
 * The Makefile and the root package.json scripts both delegate here, so there's
 * a single source of truth for what each task does.
 */
export function buildTaskRunner(ctx: RenderContext, hasDocker: boolean): string {
  const anyJs = ctx.hasWeb || ctx.hasMobile || ctx.hasShared;
  const npm = ctx.jsPm === "npm";
  const pip = ctx.pyPm === "pip";

  // Source-string builders for structured argv (kept shell-free for Windows).
  const jsInstall = npm ? `run("npm", ["install"])` : `run("pnpm", ["install"])`;
  const jsRun = (pkg: string, script: string) =>
    npm
      ? `run("npm", ["run", "${script}", "-w", "${pkg}"])`
      : `run("pnpm", ["--filter", "${pkg}", "${script}"])`;
  const pyManage = (...sub: string[]) => {
    const args = sub.map((s) => `"${s}"`).join(", ");
    return ctx.pyPm === "uv"
      ? `run("uv", ["run", "python", "manage.py", ${args}], SERVER)`
      : `run(venvPy, ["manage.py", ${args}], SERVER)`;
  };
  const serverDev = ctx.pyPm === "uv"
    ? `["uv", ["run", "python", "manage.py", "runserver", "0.0.0.0:8000"], SERVER]`
    : `[venvPy, ["manage.py", "runserver", "0.0.0.0:8000"], SERVER]`;
  const jsDevTuple = (pkg: string, script: string) =>
    npm
      ? `["npm", ["run", "${script}", "-w", "${pkg}"]]`
      : `["pnpm", ["--filter", "${pkg}", "${script}"]]`;

  const devTuples: string[] = [];
  if (ctx.hasServer) devTuples.push(serverDev);
  if (ctx.hasWeb) devTuples.push(jsDevTuple("web", "dev"));
  if (ctx.hasMobile) devTuples.push(jsDevTuple("mobile", "start"));
  const needsParallel = devTuples.length > 1;

  const L: string[] = [];
  L.push(
    `#!/usr/bin/env node`,
    `// ${ctx.projectName} — cross-platform task runner (generated by partweave).`,
    `// Run a task on any OS:  node scripts/run.mjs <task>`,
    `// Also available as:     npm run <task>   ·   make <task> (on macOS/Linux)`,
    needsParallel
      ? `import { spawn, spawnSync } from "node:child_process";`
      : `import { spawnSync } from "node:child_process";`,
    `import { existsSync } from "node:fs";`,
    ``,
    `const isWin = process.platform === "win32";`,
    `const SERVER = { cwd: "apps/server" };`,
  );
  if (ctx.hasServer && pip) {
    L.push(`const venvPy = isWin ? ".venv\\\\Scripts\\\\python.exe" : ".venv/bin/python";`);
  }
  L.push(
    ``,
    `// Windows must spawn Node's .cmd shims through a shell; POSIX doesn't.`,
    `function run(cmd, args = [], opts = {}) {`,
    `  const r = spawnSync(cmd, args, { stdio: "inherit", shell: isWin, ...opts });`,
    `  if (r.error) { console.error("\\u2716 " + cmd + ": " + r.error.message); process.exit(1); }`,
    `  if (r.status) process.exit(r.status);`,
    `}`,
    `function has(cmd) {`,
    `  const p = isWin`,
    `    ? spawnSync("where", [cmd], { stdio: "ignore" })`,
    `    : spawnSync("sh", ["-c", "command -v " + cmd], { stdio: "ignore" });`,
    `  return p.status === 0;`,
    `}`,
    ``,
  );

  if (needsParallel) {
    L.push(
      `// Run several long-lived dev servers at once; Ctrl-C stops them all.`,
      `function parallel(specs) {`,
      `  const kids = specs.map(([cmd, args, opts = {}]) =>`,
      `    spawn(cmd, args, { stdio: "inherit", shell: isWin, ...opts }));`,
      `  const stop = () => kids.forEach((k) => k.kill());`,
      `  process.on("SIGINT", stop);`,
      `  process.on("SIGTERM", stop);`,
      `  kids.forEach((k) => k.on("exit", (code) => { if (code) { stop(); process.exit(code); } }));`,
      `}`,
      ``,
    );
  }

  // bootstrap preflight — ensure the project's package managers exist.
  const ensure: string[] = [];
  if (anyJs && ctx.jsPm === "pnpm") {
    ensure.push(
      `  if (!has("pnpm")) {`,
      `    console.log("pnpm not found \\u2014 enabling it via corepack\\u2026");`,
      `    spawnSync("corepack", ["enable", "pnpm"], { stdio: "inherit", shell: isWin });`,
      `    if (!has("pnpm")) { console.error("Could not enable pnpm. Install it with: npm i -g pnpm"); process.exit(1); }`,
      `  }`,
    );
  }
  if (ctx.hasServer && ctx.pyPm === "uv") {
    ensure.push(
      `  if (!has("uv")) {`,
      `    console.error("uv not found. Install it, then re-run bootstrap:\\n  " + (isWin`,
      `      ? 'powershell -ExecutionPolicy Bypass -c "irm https://astral.sh/uv/install.ps1 | iex"'`,
      `      : "curl -LsSf https://astral.sh/uv/install.sh | sh"));`,
      `    process.exit(1);`,
      `  }`,
    );
  }
  if (ctx.hasServer && pip) {
    ensure.push(
      `  if (!has("python3") && !has("python")) { console.error("Python 3 not found. Install Python 3.12+ and re-run."); process.exit(1); }`,
    );
  }
  L.push(
    `function ensureTools() {`,
    ...(ensure.length ? ensure : [`  // npm and pip ship with Node and Python respectively.`]),
    `}`,
    ``,
  );

  if (ctx.hasServer && pip) {
    L.push(
      `function pipSync() {`,
      `  const py = has("python3") ? "python3" : "python";`,
      `  run(py, ["-m", "venv", ".venv"], SERVER);`,
      `  run(venvPy, ["-m", "pip", "install", "-U", "pip"], SERVER);`,
      `  run(venvPy, ["scripts/sync_deps.py"], SERVER);`,
      `}`,
      ``,
    );
  }

  // Task map.
  L.push(`const tasks = {`);
  const boot: string[] = [`    ensureTools();`];
  if (anyJs) boot.push(`    ${jsInstall};`);
  if (ctx.hasServer) boot.push(pip ? `    pipSync();` : `    run("uv", ["sync"], SERVER);`);
  L.push(`  bootstrap() {`, ...boot, `  },`);

  if (devTuples.length === 1) {
    L.push(`  dev() { const [c, a, o = {}] = ${devTuples[0]}; run(c, a, o); },`);
  } else if (devTuples.length > 1) {
    L.push(`  dev() { parallel([${devTuples.join(", ")}]); },`);
  }
  if (ctx.hasWeb) L.push(`  web() { ${jsRun("web", "dev")}; },`);
  if (ctx.hasMobile) L.push(`  mobile() { ${jsRun("mobile", "start")}; },`);
  if (ctx.hasServer) {
    L.push(`  server() { ${pyManage("runserver", "0.0.0.0:8000")}; },`);
    L.push(`  migrate() { ${pyManage("migrate")}; },`);
    L.push(`  superuser() { ${pyManage("createsuperuser")}; },`);
    if (hasDocker) {
      L.push(
        `  "db:up"() {`,
        `    if (spawnSync("docker", ["info"], { stdio: "ignore", shell: isWin }).status) {`,
        `      console.error("Docker isn't running \\u2014 start Docker Desktop and retry."); process.exit(1);`,
        `    }`,
        `    const env = existsSync(".env") ? ["--env-file", ".env"] : [];`,
        `    run("docker", ["compose", ...env, "-f", "infra/docker-compose.yml", "up", "-d", "db"]);`,
        `  },`,
        `  "db:down"() { run("docker", ["compose", "-f", "infra/docker-compose.yml", "down"]); },`,
      );
    }
  }
  if (ctx.hasApiClient) L.push(`  "gen:api"() { ${jsRun("@app/api-client", "generate")}; },`);
  L.push(`};`, ``);

  L.push(
    `const task = process.argv[2];`,
    `if (!task || !Object.hasOwn(tasks, task)) {`,
    `  console.log("Tasks: " + Object.keys(tasks).join(", "));`,
    `  process.exit(task ? 1 : 0);`,
    `}`,
    `tasks[task]();`,
    ``,
  );
  return L.join("\n");
}

/**
 * The Makefile is a thin convenience wrapper for macOS/Linux: every recipe just
 * calls the cross-platform runner (`node scripts/run.mjs <task>`), so `make` and
 * `npm run` stay in lock-step. Windows users use `npm run <task>` instead.
 */
export function buildMakefile(ctx: RenderContext, hasDocker: boolean): string {
  const L: string[] = [];
  const phony: string[] = [];
  const add = (name: string, task: string, help: string) => {
    phony.push(name);
    L.push(`${name}: ## ${help}`, `\tnode scripts/run.mjs ${task}`, "");
  };

  L.push("# " + ctx.projectName + " — dev tasks (wrappers around scripts/run.mjs)");
  L.push(".DEFAULT_GOAL := help");
  L.push("");

  add("bootstrap", "bootstrap", "install all dependencies");
  add("dev", "dev", "run all dev servers");
  if (ctx.hasServer) {
    if (hasDocker) {
      add("db-up", "db:up", "start Postgres (needs Docker running)");
      add("db-down", "db:down", "stop Postgres");
    }
    add("migrate", "migrate", "run migrations");
    add("server", "server", "run the Django dev server");
    add("superuser", "superuser", "create an admin user");
  }
  if (ctx.hasWeb) add("web", "web", "run the Next.js dev server");
  if (ctx.hasMobile) add("mobile", "mobile", "run the Expo dev server");
  if (ctx.hasApiClient) add("gen-api", "gen:api", "regenerate the typed API client");

  L.push(
    "help: ## show this help",
    '\t@grep -E \'^[a-zA-Z_-]+:.*?## .*$$\' $(MAKEFILE_LIST) | awk \'BEGIN {FS = ":.*?## "}; {printf "  \\033[36m%-12s\\033[0m %s\\n", $$1, $$2}\'',
    "",
    ".PHONY: " + [...phony, "help"].join(" "),
    "",
  );
  return L.join("\n");
}

export function buildTurboJson(ctx: RenderContext): string | null {
  if (!(ctx.hasWeb || ctx.hasMobile || ctx.hasShared)) return null;
  return (
    JSON.stringify(
      {
        $schema: "https://turbo.build/schema.json",
        tasks: {
          build: { dependsOn: ["^build"], outputs: ["dist/**", ".next/**"] },
          dev: { cache: false, persistent: true },
          typecheck: { dependsOn: ["^build"] },
          lint: {},
        },
      },
      null,
      2,
    ) + "\n"
  );
}

export function buildTsconfigBase(ctx: RenderContext): string | null {
  if (!(ctx.hasWeb || ctx.hasMobile || ctx.hasShared)) return null;
  return (
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          lib: ["ES2023"],
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
          isolatedModules: true,
        },
      },
      null,
      2,
    ) + "\n"
  );
}

/**
 * React Native / Expo behave badly with pnpm's symlinked store, so a mobile
 * project pins a hoisted node_modules layout. npm already installs flat, so it
 * needs no .npmrc.
 */
export function buildNpmrc(ctx: RenderContext): string | null {
  if (!ctx.hasMobile) return null;
  if (!jsPmProfile(ctx.jsPm).needsHoistNpmrc) return null;
  return [
    "# Expo / React Native need a flat node_modules layout.",
    "node-linker=hoisted",
    "shamefully-hoist=true",
    "",
  ].join("\n");
}

export function buildBaseEnv(ctx: RenderContext): string {
  const lines: string[] = [
    "# Environment for " + ctx.projectName,
    "#",
    "# Every value the app reads from the environment lives here. Copy this file to",
    "# `.env` and adjust as needed — the server, web/mobile apps, and each component",
    "# read their configuration from it, so there's nothing to configure elsewhere.",
    "",
  ];
  if (ctx.hasServer) {
    lines.push(
      "# --- server ---",
      "# Unique per-project key generated at scaffold time; signs sessions and JWTs.",
      "# Use a separate secret value in production (and never commit the real one).",
      `DJANGO_SECRET_KEY=${randomBytes(48).toString("base64url")}`,
      "DJANGO_DEBUG=true",
      "DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1",
      "# Web origins allowed to call the API when DEBUG is off (comma-separated).",
      "# In DEBUG every origin is allowed, so this is only needed in production.",
      "# DJANGO_CORS_ALLOWED_ORIGINS=https://app.example.com",
      "# DATABASE_URL — the server uses local SQLite by default; set a database URL",
      "# to switch (the `db-postgres` component sets a Postgres DSN here for you).",
      "",
    );
  }
  if (ctx.hasWeb) {
    lines.push("# --- web ---", "NEXT_PUBLIC_API_URL=http://localhost:8000", "");
  }
  if (ctx.hasMobile) {
    lines.push(
      "# --- mobile (Expo) ---",
      "# In dev the app auto-detects your machine's LAN IP so a physical device can",
      "# reach the server — leave this unset. Set it for simulators or production,",
      "# in the environment or apps/mobile/.env (Expo reads EXPO_PUBLIC_* from there).",
      "# EXPO_PUBLIC_API_URL=http://localhost:8000",
      "",
    );
  }
  return lines.join("\n");
}

/**
 * Per-app GitHub Actions with path filters, so a change to one app only runs
 * that app's pipeline. Returns { relativePath: content } for present apps.
 */
/** GitHub Actions steps (8-space indented, under `steps:`) that set up the JS PM and install. */
function jsCiSteps(ctx: RenderContext): string {
  if (ctx.jsPm === "npm") {
    return `      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install`;
  }
  return `      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile`;
}

/** GitHub Actions steps that set up the Python PM, install deps, and run checks (working-directory: apps/server). */
function serverCiSteps(ctx: RenderContext): string {
  const py = pyPmProfile(ctx.pyPm);
  if (ctx.pyPm === "pip") {
    return `      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: ${py.syncInServer}
      - run: ${py.run("ruff check .")}
      - run: ${py.run("python manage.py migrate")}
      - run: ${py.run("pytest -q")}`;
  }
  return `      - uses: astral-sh/setup-uv@v5
      - run: ${py.syncInServer}
      - run: ${py.run("ruff check .")}
      - run: ${py.run("python manage.py migrate")}
      - run: ${py.run("pytest -q")}`;
}

export function buildCiWorkflows(ctx: RenderContext): Record<string, string> {
  const js = jsPmProfile(ctx.jsPm);
  const out: Record<string, string> = {};
  if (ctx.hasServer) {
    out[".github/workflows/server.yml"] = `name: server
on:
  push:
    paths: ["apps/server/**", ".github/workflows/server.yml"]
  pull_request:
    paths: ["apps/server/**", ".github/workflows/server.yml"]
jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/server
    steps:
      - uses: actions/checkout@v4
${serverCiSteps(ctx)}
`;
  }
  if (ctx.hasWeb) {
    out[".github/workflows/web.yml"] = `name: web
on:
  push:
    paths: ["apps/web/**", "packages/**", ".github/workflows/web.yml"]
  pull_request:
    paths: ["apps/web/**", "packages/**", ".github/workflows/web.yml"]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
${jsCiSteps(ctx)}
      - run: ${js.run("web", "typecheck")}
      - run: ${js.run("web", "build")}
`;
  }
  if (ctx.hasMobile) {
    out[".github/workflows/mobile.yml"] = `name: mobile
on:
  push:
    paths: ["apps/mobile/**", "packages/**", ".github/workflows/mobile.yml"]
  pull_request:
    paths: ["apps/mobile/**", "packages/**", ".github/workflows/mobile.yml"]
jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
${jsCiSteps(ctx)}
      - run: ${js.run("mobile", "typecheck")}
`;
  }
  return out;
}

export function buildReadme(
  ctx: RenderContext,
  modules: Module[],
): string {
  const parts: string[] = [];
  parts.push(`# ${ctx.projectName}`, "", ctx.description, "");
  parts.push("Generated with **partweave** — a modular full-stack scaffolder.", "");

  parts.push("## What's inside", "");
  if (ctx.hasServer) parts.push(`- \`apps/server\` — Django + DRF API (managed by \`${ctx.pyPm}\`)`);
  if (ctx.hasWeb) parts.push("- `apps/web` — Next.js web app");
  if (ctx.hasMobile) parts.push("- `apps/mobile` — Expo (React Native) app");
  if (ctx.hasShared) parts.push("- `packages/shared` — shared TypeScript interfaces & schemas");
  if (ctx.hasApiClient) parts.push("- `packages/api-client` — typed client generated from the API's OpenAPI schema");
  parts.push("");

  if (modules.length) {
    parts.push("### Components", "");
    for (const m of modules) parts.push(`- **${m.manifest.title}** — ${m.manifest.description ?? ""}`);
    parts.push("");
  }

  parts.push(
    "## Getting started",
    "",
    "These `npm run` tasks work the same on macOS, Linux, and Windows (they wrap",
    "`scripts/run.mjs`). On macOS/Linux you can also use `make <task>`.",
    "",
    "```sh",
    "npm run bootstrap",
  );
  const hasDocker = modules.some((m) => m.manifest.id === "docker");
  if (ctx.hasServer) {
    if (hasDocker) parts.push("npm run db:up        # start Postgres (needs Docker)");
    parts.push("npm run migrate", "npm run server   # http://localhost:8000");
  }
  if (ctx.hasWeb) parts.push("npm run web      # http://localhost:3000");
  if (ctx.hasMobile) parts.push("npm run mobile   # Expo dev server");
  parts.push("```", "");

  parts.push("Copy `.env.example` to `.env` and fill in values before running.", "");
  return parts.join("\n");
}

/**
 * Production Dockerfile for the Django server. Emitted from code (not copied as
 * a template) so it can target uv or pip — the `docker` module only ships
 * .dockerignore and the Postgres compose file.
 */
export function buildServerDockerfile(ctx: RenderContext): string {
  if (ctx.pyPm === "pip") {
    return `# Production image for the Django server (pip / venv).
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \\
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY . .
RUN python3 -m venv .venv \\
    && .venv/bin/python -m pip install -U pip \\
    && .venv/bin/python scripts/sync_deps.py --no-dev

EXPOSE 8000
CMD [".venv/bin/gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000"]
`;
  }
  return `# Production image for the Django server, built with uv.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \\
    PYTHONDONTWRITEBYTECODE=1 \\
    UV_COMPILE_BYTECODE=1 \\
    UV_LINK_MODE=copy

WORKDIR /app

# uv binary from the official distroless image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY . .
RUN uv sync --no-dev

EXPOSE 8000
CMD ["uv", "run", "gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000"]
`;
}

/**
 * Helper script for the pip path: installs the server's dependencies from
 * pyproject.toml into ./.venv. Re-runnable — used by `make bootstrap`, CI, the
 * production Docker build (`--no-dev`), and after `partweave add`. Returns
 * null when the project uses uv (which reads pyproject natively).
 */
export function buildPipSyncScript(ctx: RenderContext): string | null {
  if (!ctx.hasServer || !pyPmProfile(ctx.pyPm).needsSyncScript) return null;
  return `#!/usr/bin/env python3
"""Install this app's dependencies from pyproject.toml into the active venv.

The pip/venv counterpart to \`uv sync\`. Run it (via the venv's Python) after
adding a component so new dependencies are picked up:

    .venv/bin/python scripts/sync_deps.py          # runtime + dev deps
    .venv/bin/python scripts/sync_deps.py --no-dev # runtime deps only (prod)
"""
import subprocess
import sys
import tomllib
from pathlib import Path

no_dev = "--no-dev" in sys.argv[1:]
pyproject = Path(__file__).resolve().parent.parent / "pyproject.toml"
data = tomllib.loads(pyproject.read_text())
deps = list(data.get("project", {}).get("dependencies", []))
if not no_dev:
    deps += data.get("dependency-groups", {}).get("dev", [])
if deps:
    subprocess.check_call([sys.executable, "-m", "pip", "install", *deps])
`;
}
