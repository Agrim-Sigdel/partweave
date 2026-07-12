import { runCreate, type CreateFlags } from "./commands/create.js";
import { Command } from "commander";
import { ensureRegistry } from "./fetcher.js";
import { hasLocalModules } from "./paths.js";

/**
 * Dedicated `create-partweave` binary: same as `partweave create` but the create
 * command is the top-level program (npm-init style).
 */
const program = new Command();
program
  .name("create-partweave")
  .description("Scaffold a new full-stack project")
  .argument("[name]", "project name")
  .option("-d, --dir <path>", "target directory")
  .option("--server", "include the Django server")
  .option("--no-server", "exclude the server")
  .option("--web", "include the Next.js web app")
  .option("--no-web", "exclude the web app")
  .option("--mobile", "include the Expo mobile app")
  .option("--no-mobile", "exclude the mobile app")
  .option("--with <ids>", "comma-separated component ids")
  .option("--js-pm <pm>", "JS package manager: pnpm | npm (default: auto-detect)")
  .option("--py-pm <pm>", "Python package manager: uv | pip (default: auto-detect)")
  .option("-y, --yes", "skip prompts; use flags/defaults")
  .option("-f, --force", "write into a non-empty directory")
  .option("--update", "force update the module registry from GitHub")
  .hook("preAction", (thisCommand) => {
    const forceUpdate = thisCommand.opts().update === true;
    if (!hasLocalModules() || forceUpdate) {
      ensureRegistry(forceUpdate);
    }
  })
  .action(async (name: string | undefined, opts: Record<string, unknown>) => {
    const flags: CreateFlags = { ...(opts as CreateFlags), name };
    await runCreate(flags);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
