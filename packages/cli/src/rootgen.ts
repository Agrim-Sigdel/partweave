import type { Module, RenderContext } from "./types.js";

/**
 * The monorepo shell files that depend on *which* parts were selected are built
 * here in code (rather than copied from a template), so a server-only project
 * never mentions pnpm and a mobile-only project never mentions Postgres.
 */

/** pnpm workspace — only JS/TS packages are members (the Django server is not). */
export function buildPnpmWorkspace(ctx: RenderContext): string | null {
  const members: string[] = [];
  if (ctx.hasWeb) members.push("apps/web");
  if (ctx.hasMobile) members.push("apps/mobile");
  if (ctx.hasShared) members.push("packages/shared");
  if (ctx.hasApiClient) members.push("packages/api-client");
  if (members.length === 0) return null;
  return (
    "packages:\n" + members.map((m) => `  - "${m}"`).join("\n") + "\n"
  );
}

export function buildRootPackageJson(ctx: RenderContext): string | null {
  const anyJs = ctx.hasWeb || ctx.hasMobile || ctx.hasShared;
  if (!anyJs) return null;
  const scripts: Record<string, string> = {};
  if (ctx.hasWeb) scripts["dev:web"] = "pnpm --filter web dev";
  if (ctx.hasMobile) scripts["dev:mobile"] = "pnpm --filter mobile start";
  if (ctx.hasApiClient)
    scripts["gen:api"] = "pnpm --filter @app/api-client generate";
  scripts["typecheck"] = "pnpm -r typecheck";
  const pkg = {
    name: ctx.projectSlug,
    version: "0.1.0",
    private: true,
    packageManager: "pnpm@10.20.0",
    scripts,
    devDependencies: { typescript: "^5.7.2" },
  };
  return JSON.stringify(pkg, null, 2) + "\n";
}

export function buildMakefile(ctx: RenderContext, hasDocker: boolean): string {
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
  if (ctx.hasWeb || ctx.hasMobile || ctx.hasShared) bootstrap.push("pnpm install");
  if (ctx.hasServer) bootstrap.push("cd apps/server && uv sync");
  if (bootstrap.length) add("bootstrap", bootstrap, "install all dependencies");

  if (ctx.hasServer) {
    if (hasDocker) {
      add("db-up", ["docker compose -f infra/docker-compose.yml up -d db"], "start Postgres");
      add("db-down", ["docker compose -f infra/docker-compose.yml down"], "stop Postgres");
    }
    add("migrate", ["cd apps/server && uv run python manage.py migrate"], "run migrations");
    add(
      "server",
      ["cd apps/server && uv run python manage.py runserver 0.0.0.0:8000"],
      "run the Django dev server",
    );
    add(
      "superuser",
      ["cd apps/server && uv run python manage.py createsuperuser"],
      "create an admin user",
    );
  }
  if (ctx.hasWeb) add("web", ["pnpm --filter web dev"], "run the Next.js dev server");
  if (ctx.hasMobile) add("mobile", ["pnpm --filter mobile start"], "run the Expo dev server");
  if (ctx.hasApiClient)
    add("gen-api", ["pnpm --filter @app/api-client generate"], "regenerate the typed API client");

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
 * project pins a hoisted node_modules layout.
 */
export function buildNpmrc(ctx: RenderContext): string | null {
  if (!ctx.hasMobile) return null;
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
    lines.push("# --- mobile ---", "EXPO_PUBLIC_API_URL=http://localhost:8000", "");
  }
  return lines.join("\n");
}

/**
 * Per-app GitHub Actions with path filters, so a change to one app only runs
 * that app's pipeline. Returns { relativePath: content } for present apps.
 */
export function buildCiWorkflows(ctx: RenderContext): Record<string, string> {
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
      - uses: astral-sh/setup-uv@v5
      - run: uv sync
      - run: uv run ruff check .
      - run: uv run python manage.py migrate
      - run: uv run pytest -q
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
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter web typecheck
      - run: pnpm --filter web build
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
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter mobile typecheck
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
  if (ctx.hasServer) parts.push("- `apps/server` — Django + DRF API (managed by `uv`)");
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
