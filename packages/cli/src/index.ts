import { Command } from "commander";
import { runAdd } from "./commands/add.js";
import { runCreate, type CreateFlags } from "./commands/create.js";

export { runCreate, runAdd };

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("quick-build")
    .description("A modular full-stack scaffolder — pick parts, generate only that code.")
    .version("0.1.0");

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
    .option("-y, --yes", "skip prompts; use flags/defaults")
    .option("-f, --force", "write into a non-empty directory")
    .action(async (name: string | undefined, opts: Record<string, unknown>) => {
      const flags: CreateFlags = { ...(opts as CreateFlags), name: name ?? (opts.name as string) };
      await runCreate(flags);
    });

  program
    .command("add")
    .argument("<modules...>", "component ids to add")
    .description("Add components to an existing generated project")
    .option("-d, --dir <path>", "project directory (default: cwd)")
    .action(async (modules: string[], opts: { dir?: string }) => {
      await runAdd(modules, opts);
    });

  return program;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  await buildProgram().parseAsync(argv);
}

// Executed directly (quick-build bin)
main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
