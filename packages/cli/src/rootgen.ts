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

export function buildRootPackageJson(ctx: RenderContext): string | null {
  const anyJs = ctx.hasWeb || ctx.hasMobile || ctx.hasShared;
  if (!anyJs) return null;
  const pm = jsPmProfile(ctx.jsPm);
  const scripts: Record<string, string> = {};
  if (ctx.hasWeb) scripts["dev:web"] = pm.run("web", "dev");
  if (ctx.hasMobile) scripts["dev:mobile"] = pm.run("mobile", "start");
  if (ctx.hasApiClient) scripts["gen:api"] = pm.run("@app/api-client", "generate");
  scripts["typecheck"] = pm.runAll("typecheck");
  const pkg: Record<string, unknown> = {
    name: ctx.projectSlug,
    version: "0.1.0",
    private: true,
  };
  if (pm.packageManagerField) pkg.packageManager = pm.packageManagerField;
  // npm keeps its workspace member list here (pnpm uses pnpm-workspace.yaml).
  if (!pm.usesWorkspaceYaml) pkg.workspaces = jsMembers(ctx);
  pkg.scripts = scripts;
  pkg.devDependencies = { typescript: "^5.7.2" };
  return JSON.stringify(pkg, null, 2) + "\n";
}

export function buildMakefile(ctx: RenderContext, hasDocker: boolean): string {
  const js = jsPmProfile(ctx.jsPm);
  const py = pyPmProfile(ctx.pyPm);
  const L: string[] = [];
  const phony: string[] = [];
  const add = (name: string, body: string[], help: string) => {
    phony.push(name);
    L.push(`${name}: ## ${help}`);
    for (const line of body) L.push(`\t${line}`);
    L.push("");
  };

  L.push("# " + ctx.projectName + " — dev tasks");
  L.push(".DEFAULT_GOAL := help");
  L.push("");

  const bootstrap: string[] = [];
  if (ctx.hasWeb || ctx.hasMobile || ctx.hasShared) bootstrap.push(js.install);
  // Each Makefile recipe line runs in its own shell, so keep `cd` and the sync
  // command on one `&&`-joined line.
  if (ctx.hasServer) bootstrap.push(`cd apps/server && ${py.syncInServer}`);
  if (bootstrap.length) add("bootstrap", bootstrap, "install all dependencies");

  if (ctx.hasServer) {
    if (hasDocker) {
      add(
        "db-up",
        [
          '@docker info >/dev/null 2>&1 || { echo "Docker isn\'t running — start Docker Desktop and wait for it to be ready, then retry."; exit 1; }',
          "docker compose -f infra/docker-compose.yml up -d db",
        ],
        "start Postgres (needs Docker running)",
      );
      add("db-down", ["docker compose -f infra/docker-compose.yml down"], "stop Postgres");
    }
    add("migrate", [`cd apps/server && ${py.run("python manage.py migrate")}`], "run migrations");
    add(
      "server",
      [`cd apps/server && ${py.run("python manage.py runserver 0.0.0.0:8000")}`],
      "run the Django dev server",
    );
    add(
      "superuser",
      [`cd apps/server && ${py.run("python manage.py createsuperuser")}`],
      "create an admin user",
    );
  }
  if (ctx.hasWeb) add("web", [js.run("web", "dev")], "run the Next.js dev server");
  if (ctx.hasMobile) add("mobile", [js.run("mobile", "start")], "run the Expo dev server");
  if (ctx.hasApiClient)
    add("gen-api", [js.run("@app/api-client", "generate")], "regenerate the typed API client");

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
  const lines: string[] = ["# Environment for " + ctx.projectName, ""];
  if (ctx.hasServer) {
    lines.push(
      "# --- server ---",
      "DJANGO_SECRET_KEY=dev-insecure-change-me",
      "DJANGO_DEBUG=true",
      "DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1",
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
  parts.push("Generated with **quick-build** — a modular full-stack scaffolder.", "");

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

  parts.push("## Getting started", "", "```sh", "make bootstrap");
  if (ctx.hasServer) parts.push("make db-up && make migrate", "make server   # http://localhost:8000");
  if (ctx.hasWeb) parts.push("make web      # http://localhost:3000");
  if (ctx.hasMobile) parts.push("make mobile   # Expo dev server");
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
 * production Docker build (`--no-dev`), and after `quick-build add`. Returns
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
