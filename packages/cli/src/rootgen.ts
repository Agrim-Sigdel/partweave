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
 *
 * A mobile project also pins a hoisted node_modules layout here (React Native /
 * Expo choke on pnpm's default symlinked store). These live in the workspace
 * file — not a root .npmrc — on purpose: pnpm 10.6+ reads them here, and keeping
 * them out of .npmrc means running `npm run <task>` on a pnpm project doesn't spew
 * "Unknown project config" warnings for pnpm-only keys.
 */
export function buildJsWorkspace(ctx: RenderContext): string | null {
  if (!jsPmProfile(ctx.jsPm).usesWorkspaceYaml) return null;
  const members = jsMembers(ctx);
  if (members.length === 0) return null;
  let out = "packages:\n" + members.map((m) => `  - "${m}"`).join("\n") + "\n";
  if (ctx.hasMobile && jsPmProfile(ctx.jsPm).needsHoisting) {
    out +=
      "\n# Expo / React Native need a flat node_modules layout.\n" +
      "nodeLinker: hoisted\n" +
      "shamefullyHoist: true\n";
  }
  return out;
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

  // Expo/React Native (glob@7, rimraf@3, inflight, uuid@7) and the jsdom-based
  // test runners (abab, domexception, whatwg-encoding) drag in deprecated
  // *transitive* deps that pnpm loudly summarizes on install. None are ours to
  // upgrade — they carry no compatible newer version and resolve only when those
  // frameworks update — so acknowledge the known-benign ones instead of alarming
  // the user. Pinned to the observed majors so a genuinely *new* deprecation
  // still surfaces. pnpm-only: npm has no equivalent (its warnings are inline).
  if (anyJs && ctx.jsPm === "pnpm") {
    const allowed: Record<string, string> = {};
    if (ctx.hasMobile) {
      Object.assign(allowed, {
        abab: "2",
        domexception: "4",
        glob: "7",
        inflight: "1",
        rimraf: "3",
        uuid: "7",
      });
    }
    if (ctx.hasWeb || ctx.hasMobile) {
      // web pulls jsdom@25 (whatwg-encoding@3); mobile's jest uses jsdom@20 (@2).
      allowed["whatwg-encoding"] =
        ctx.hasWeb && ctx.hasMobile ? "2 || 3" : ctx.hasWeb ? "3" : "2";
    }
    if (Object.keys(allowed).length > 0) {
      pkg.pnpm = { allowedDeprecatedVersions: allowed };
    }
  }
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
 * Each app reads its **own** env file (the framework's native convention): Django
 * reads `apps/server/.env`, Next.js reads `apps/web/.env`, Expo reads
 * `apps/mobile/.env`, and docker compose reads the root `.env` for the database
 * container. We emit a committed `.env.example` (placeholder secret) and a
 * gitignored, ready-to-run `.env` (real generated secret) for each.
 *
 * A component's env keys route to the app that consumes them, by prefix:
 * `POSTGRES_*` → root infra, `NEXT_PUBLIC_*` → web, `EXPO_PUBLIC_*` → mobile,
 * everything else → server. Those prefixes are exactly the frameworks' own
 * conventions, so the routing is self-describing.
 */
export interface EnvFile {
  /** directory (relative to the project root) the pair is written into; "" is the root */
  dir: string;
  /** committed template with a placeholder secret */
  example: string;
  /** gitignored, ready-to-run file with the real generated secret */
  env: string;
}

type EnvScope = "server" | "web" | "mobile" | "root";

function envScopeFor(key: string): EnvScope {
  if (key.startsWith("POSTGRES_")) return "root";
  if (key.startsWith("NEXT_PUBLIC_")) return "web";
  if (key.startsWith("EXPO_PUBLIC_")) return "mobile";
  return "server";
}

export function buildEnvFiles(ctx: RenderContext, modules: Module[]): EnvFile[] {
  // Component keys, grouped by the app that reads them (headed by module title).
  const componentBlocks: Record<EnvScope, string[]> = { server: [], web: [], mobile: [], root: [] };
  for (const m of modules) {
    const byScope: Record<EnvScope, string[]> = { server: [], web: [], mobile: [], root: [] };
    for (const [key, value] of Object.entries(m.manifest.env)) {
      byScope[envScopeFor(key)].push(`${key}=${value}`);
    }
    for (const scope of ["server", "web", "mobile", "root"] as EnvScope[]) {
      if (byScope[scope].length === 0) continue;
      componentBlocks[scope].push(`# ${m.manifest.title}`, ...byScope[scope], "");
    }
  }

  const render = (lines: string[]): string => lines.join("\n").replace(/\n*$/, "\n");
  const files: EnvFile[] = [];

  if (ctx.hasServer) {
    // Only the secret line differs between the committed example and the real file.
    const serverBase = (secretLine: string): string[] => [
      `# ${ctx.projectName} — server (Django). Read by apps/server.`,
      "# `.env` is gitignored; keep real secrets here, not in `.env.example`.",
      "",
      "# Unique per-project key; signs sessions and JWTs.",
      secretLine,
      "DJANGO_DEBUG=true",
      "# Leave DJANGO_ALLOWED_HOSTS unset in dev: with DEBUG on, any host is allowed,",
      "# so a phone/simulator can reach the server over your LAN (e.g. 192.168.x.y).",
      "# Set it (comma-separated) in production, e.g. DJANGO_ALLOWED_HOSTS=api.example.com",
      "# Origins allowed to call the API when DEBUG is off (comma-separated).",
      "# DJANGO_CORS_ALLOWED_ORIGINS=https://app.example.com",
      "# DATABASE_URL — unset uses local SQLite; the db-postgres component sets a Postgres DSN.",
      "",
    ];
    files.push({
      dir: "apps/server",
      example: render([...serverBase("DJANGO_SECRET_KEY=replace-with-a-generated-secret"), ...componentBlocks.server]),
      env: render([...serverBase(`DJANGO_SECRET_KEY=${randomBytes(48).toString("base64url")}`), ...componentBlocks.server]),
    });
  }

  if (ctx.hasWeb) {
    const web = [
      `# ${ctx.projectName} — web (Next.js). Read by apps/web.`,
      "# Only NEXT_PUBLIC_* is exposed to the browser.",
      "NEXT_PUBLIC_API_URL=http://localhost:8000",
      "",
      ...componentBlocks.web,
    ];
    const body = render(web);
    files.push({ dir: "apps/web", example: body, env: body });
  }

  if (ctx.hasMobile) {
    const mobile = [
      `# ${ctx.projectName} — mobile (Expo). Read by apps/mobile.`,
      "# Only EXPO_PUBLIC_* is exposed to the app. In dev the app auto-detects your",
      "# machine's LAN IP, so this can stay unset; set it for simulators/device/production.",
      "# EXPO_PUBLIC_API_URL=http://localhost:8000",
      "",
      ...componentBlocks.mobile,
    ];
    const body = render(mobile);
    files.push({ dir: "apps/mobile", example: body, env: body });
  }

  // Root env exists only to feed the database container (docker compose reads it
  // via `--env-file .env`); populated by the docker component's POSTGRES_* keys.
  if (componentBlocks.root.length > 0) {
    const root = [
      `# ${ctx.projectName} — infrastructure. Read by docker compose (--env-file .env).`,
      "# Keep these in sync with DATABASE_URL in apps/server/.env.",
      "",
      ...componentBlocks.root,
    ];
    const body = render(root);
    files.push({ dir: "", example: body, env: body });
  }

  return files;
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
  // Least-privilege GITHUB_TOKEN: these workflows only read the checkout (F34).
  const permissions = "permissions:\n  contents: read\n";
  if (ctx.hasServer) {
    out[".github/workflows/server.yml"] = `name: server
on:
  push:
    paths: ["apps/server/**", ".github/workflows/server.yml"]
  pull_request:
    paths: ["apps/server/**", ".github/workflows/server.yml"]
${permissions}jobs:
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
${permissions}jobs:
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
${permissions}jobs:
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
  parts.push(
    "Generated with [partweave](https://github.com/Agrim-Sigdel/partweave) — a modular " +
      "full-stack scaffolder by Agrim Sigdel.",
    "",
  );

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

  parts.push("## Configuration", "");
  parts.push(
    "Each app reads its **own** env file, created for you (and gitignored) with a",
    "committed `.env.example` template alongside it. Edit the `.env` to change values:",
    "",
  );
  const envFiles: string[] = [];
  if (ctx.hasServer) envFiles.push("- `apps/server/.env` — Django secret key, allowed hosts, `DATABASE_URL`");
  if (ctx.hasWeb) envFiles.push("- `apps/web/.env` — `NEXT_PUBLIC_*` (browser-exposed)");
  if (ctx.hasMobile) envFiles.push("- `apps/mobile/.env` — `EXPO_PUBLIC_*` (app-exposed)");
  if (hasDocker) envFiles.push("- `.env` (root) — `POSTGRES_*` for the database container");
  parts.push(...envFiles, "");
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
