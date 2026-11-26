import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const { values } = parseArgs({ options: {
  matrix: { type: "boolean" },
  case: { type: "string" },
  dir: { type: "string" },
  keep: { type: "boolean" },
} });
const env = { ...process.env, CI: "1", NEXT_TELEMETRY_DISABLED: "1", EXPO_NO_TELEMETRY: "1", PYTHONDONTWRITEBYTECODE: "1" };

function run(command, args, cwd, capture = false) {
  const result = spawnSync(command, args, {
    cwd, env, encoding: "utf8", stdio: capture ? "pipe" : "inherit",
    shell: process.platform === "win32" && /^(npm|pnpm)$/.test(command),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.status})${capture ? `\n${result.stderr}\n${result.stdout}` : ""}`);
  }
  return result.stdout;
}

if (!existsSync(cli)) throw new Error("Build the CLI before checking the catalog.");
const catalog = JSON.parse(run(process.execPath, [cli, "list", "--json"], undefined, true)).data;
const byId = new Map(catalog.modules.map((mod) => [mod.id, mod]));
const appNames = catalog.apps;

function moduleApps(id, seen = new Set()) {
  if (seen.has(id)) return [];
  seen.add(id);
  const mod = byId.get(id);
  if (!mod) throw new Error(`Catalog dependency is missing: ${id}`);
  return [...mod.targets.filter((target) => appNames.includes(target)),
    ...mod.requiresApps, ...mod.requires.flatMap((dep) => moduleApps(dep, seen))];
}

// Discover new modules automatically: adding a catalog entry adds a runtime CI
// job, including its dependency closure but no unrelated feature modules.
const cases = catalog.modules.map((mod) => {
  const apps = moduleApps(mod.id);
  return { id: `module-${mod.id}`, apps: apps.length ? appNames.filter((app) => apps.includes(app)) : appNames,
    modules: [mod.id], jsPm: "pnpm", pyPm: "uv" };
});
cases.push(
  ...appNames.map((app) => ({ id: `bare-${app}`, apps: [app], modules: [], jsPm: "pnpm", pyPm: "uv" })),
  { id: "combined", apps: appNames, modules: ["auth", "ci", "docker", "example", "feedback", "storage", "ui-kit"], jsPm: "pnpm", pyPm: "uv" },
  { id: "feedback-npm-pip", apps: appNames, modules: ["feedback"], jsPm: "npm", pyPm: "pip" },
);

if (values.matrix) {
  console.log(JSON.stringify({ include: cases.map(({ id }) => ({ id })) }));
  process.exit(0);
}
const selected = values.case ? cases.filter((entry) => entry.id === values.case) : cases;
if (!selected.length) throw new Error(`Unknown case ${values.case}. Available: ${cases.map((entry) => entry.id).join(", ")}`);
const root = values.dir ? resolve(values.dir) : mkdtempSync(join(tmpdir(), "pw-catalog-check-"));
mkdirSync(root, { recursive: true });
console.log(`Generated project checks: ${root}`);

for (const entry of selected) {
  const dir = join(root, entry.id);
  console.log(`\nChecking ${entry.id}`);
  const generated = JSON.parse(run(process.execPath, [cli, "create", entry.id, "--dir", dir,
    ...appNames.map((app) => `--${entry.apps.includes(app) ? "" : "no-"}${app}`),
    "--with", entry.modules.join(","), "--js-pm", entry.jsPm, "--py-pm", entry.pyPm, "--yes", "--json"], undefined, true));
  if (!generated.ok) throw new Error(JSON.stringify(generated.error));

  // Only Postgres selections use the test service; bare/feedback servers must
  // also work with the generated SQLite default and no infrastructure.
  delete env.DATABASE_URL;
  if (generated.data.modules.includes("db-postgres") && process.env.PARTWEAVE_TEST_DATABASE_URL) {
    env.DATABASE_URL = process.env.PARTWEAVE_TEST_DATABASE_URL;
  }
  run(process.execPath, ["scripts/run.mjs", "bootstrap"], dir);
  const workspace = (name, task, extra = []) => run(entry.jsPm, entry.jsPm === "pnpm"
    ? ["--filter", name, "run", task, ...extra]
    : ["--workspace", name, "run", task, "--", ...extra], dir);

  if (entry.apps.some((app) => app !== "server")) {
    run(entry.jsPm, entry.jsPm === "pnpm" ? ["--workspace-concurrency=1", "-r", "typecheck"] : ["run", "typecheck", "--workspaces", "--if-present"], dir);
  }
  if (entry.apps.includes("web")) {
    workspace("web", "test");
    workspace("web", "build");
  }
  if (entry.apps.includes("mobile")) {
    // React Native's first render can exceed Jest's five-second default on a cold runner.
    workspace("mobile", "test", ["--runInBand", "--watchman=false", "--testTimeout=30000"]);
    const args = ["expo", "export", "--platform", "android", "--max-workers", "2", "--output-dir", join(dir, "expo-out")];
    run(entry.jsPm, entry.jsPm === "pnpm" ? ["--filter", "mobile", "exec", ...args] : ["exec", "--workspace", "mobile", "--", ...args], dir);
  }
  if (entry.apps.includes("server")) {
    const server = join(dir, "apps/server");
    const python = join(server, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
    const postgres = generated.data.modules.includes("db-postgres");
    const databaseName = `pw_check_${randomUUID().replaceAll("-", "")}`;
    const database = (operation) => run(python, ["-c", `import os, psycopg\nfrom psycopg import sql\nwith psycopg.connect(os.environ['PARTWEAVE_CHECK_ADMIN_URL'], autocommit=True) as connection:\n    connection.execute(sql.SQL('${operation} DATABASE {}').format(sql.Identifier('${databaseName}')))`], server);
    if (postgres) {
      env.PARTWEAVE_CHECK_ADMIN_URL = env.DATABASE_URL ?? readFileSync(join(server, ".env"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1];
      database("CREATE");
      const url = new URL(env.PARTWEAVE_CHECK_ADMIN_URL);
      url.pathname = `/${databaseName}`;
      env.DATABASE_URL = url.href;
    }
    try {
      run(python, ["manage.py", "check"], server);
      run(python, ["manage.py", "makemigrations", "--check", "--dry-run"], server);
      run(python, ["manage.py", "migrate", "--noinput"], server);
      run(python, ["-m", "pytest", "-q"], server);
    } finally {
      if (postgres) database("DROP");
      delete env.PARTWEAVE_CHECK_ADMIN_URL;
    }
  }
  console.log(`Passed ${entry.id}`);
  if (!values.keep) rmSync(dir, { recursive: true, force: true });
}
console.log(`\nPassed ${selected.length} generated-project case(s). ${values.keep ? `Artifacts: ${root}` : "Successful projects removed; use --keep to retain them."}`);
