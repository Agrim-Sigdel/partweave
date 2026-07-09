import { Command } from "commander";
import { runAdd } from "./commands/add.js";
import { runCreate, type CreateFlags } from "./commands/create.js";
import { runDoctor } from "./commands/doctor.js";
import { runList } from "./commands/list.js";
import { runPlan } from "./commands/plan.js";
import { toPartweaveError } from "./errors.js";
import { readVersion } from "./paths.js";

export { runCreate, runAdd, runDoctor, runList, runPlan };

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("partweave")
    .description("A modular full-stack scaffolder — pick parts, generate only that code.")
    .version(readVersion(), "-V, --version", "print the partweave version");

  program
    .command("create", { isDefault: true })
    .argument("[name]", "project name")
    .description("Scaffold a new project")
    .option("-d, --dir <path>", "target directory")
    .option("--server", "include the Django server")
    .option("--no-server", "exclude the server")
    .option("--web", "include the Next.js web app")
    .option("--no-web", "exclude the web app")
    .option("--mobile", "include the Expo mobile app")
    .option("--no-mobile", "exclude the mobile app")
    .option("--with <ids>", "comma-separated component ids (e.g. auth,docker,ci)")
    .option("--js-pm <pm>", "JS package manager: pnpm | npm (default: auto-detect)")
    .option("--py-pm <pm>", "Python package manager: uv | pip (default: auto-detect)")
    .option("-y, --yes", "skip prompts; use flags/defaults")
    .option("-f, --force", "write into a non-empty directory")
    .option("--install", "install dependencies after scaffolding (default: ask, off with --yes)")
    .option("--git", "initialize a git repo + initial commit (default: ask, off with --yes)")
    .option("--no-git", "skip git initialization")
    .option("--non-interactive", "never prompt; use flags/defaults (implied by piped stdout and --json)")
    .option("--json", "emit a machine-readable JSON result envelope (implies --non-interactive)")
    .action(async (name: string | undefined, opts: Record<string, unknown>) => {
      const flags: CreateFlags = { ...(opts as CreateFlags), name: name ?? (opts.name as string) };
      await runCreate(flags);
    });

  program
    .command("add")
    .argument("<items...>", "apps (server/web/mobile) or component ids to add")
    .description("Add an app or component to an existing generated project")
    .option("-d, --dir <path>", "project directory (default: cwd)")
    .option("--json", "emit a machine-readable JSON result envelope")
    .action(async (items: string[], opts: { dir?: string; json?: boolean }) => {
      await runAdd(items, opts);
    });

  program
    .command("list")
    .description("List the module catalog (apps + components)")
    .option("--json", "emit the catalog as a JSON envelope")
    .action(async (opts: { json?: boolean }) => {
      await runList(opts);
    });

  program
    .command("plan")
    .description("Preview what a selection would generate — writes nothing")
    .argument("[name]", "project name")
    .option("--server", "include the Django server")
    .option("--no-server", "exclude the server")
    .option("--web", "include the Next.js web app")
    .option("--no-web", "exclude the web app")
    .option("--mobile", "include the Expo mobile app")
    .option("--no-mobile", "exclude the mobile app")
    .option("--with <ids>", "comma-separated component ids (e.g. auth,docker,ci)")
    .option("--json", "emit the plan as a JSON envelope")
    .action(async (name: string | undefined, opts: Record<string, unknown>) => {
      await runPlan({ ...opts, name: name ?? (opts.name as string) });
    });

  program
    .command("doctor")
    .description("Check your environment and install any missing package managers")
    .option("-d, --dir <path>", "project directory (default: cwd)")
    .action(async (opts: { dir?: string }) => {
      await runDoctor(opts);
    });

  return program;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  await buildProgram().parseAsync(argv);
}

// Executed directly (partweave bin). Commands emit their own typed envelopes and
// exit; this is the last-resort fallback for anything that escapes them.
main().catch((err) => {
  const pe = toPartweaveError(err);
  console.error(pe.message);
  process.exit(pe.exitCode);
});
