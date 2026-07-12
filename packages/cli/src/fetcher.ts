import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import pc from "picocolors";
import { PartweaveError } from "./errors.js";

export const REGISTRY_URL = "https://github.com/Agrim-Sigdel/partweave.git";
export const REGISTRY_DIR = join(homedir(), ".partweave", "registry", "main");

export function ensureRegistry(forceUpdate = false): void {
  const gitDir = join(REGISTRY_DIR, ".git");

  if (!existsSync(gitDir)) {
    console.log(pc.cyan(`Downloading Partweave registry from GitHub...`));
    mkdirSync(REGISTRY_DIR, { recursive: true });
    try {
      execSync(`git clone --depth 1 ${REGISTRY_URL} .`, {
        cwd: REGISTRY_DIR,
        stdio: "ignore",
      });
      console.log(pc.green(`✔ Registry downloaded successfully.`));
    } catch (err: any) {
      throw new PartweaveError(
        "fetch-failed",
        `Failed to clone registry from ${REGISTRY_URL}: ${err.message}`
      );
    }
  } else if (forceUpdate) {
    console.log(pc.cyan(`Updating Partweave registry...`));
    try {
      execSync(`git pull`, {
        cwd: REGISTRY_DIR,
        stdio: "ignore",
      });
      console.log(pc.green(`✔ Registry updated successfully.`));
    } catch (err: any) {
      throw new PartweaveError(
        "update-failed",
        `Failed to update registry: ${err.message}. Check your internet connection.`
      );
    }
  }
}
