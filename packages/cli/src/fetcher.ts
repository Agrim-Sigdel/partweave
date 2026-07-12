import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import pc from "picocolors";
import { PartweaveError } from "./errors.js";

export const REGISTRY_URL = "https://github.com/Agrim-Sigdel/partweave.git";

/**
 * Which git ref (branch, tag, or commit) to pull modules from. Defaults to
 * `main` — the always-latest catalog — but can be pinned for reproducible
 * scaffolds: `PARTWEAVE_REGISTRY_REF=v0.5.0 partweave create ...` freezes the
 * catalog to a release so two runs weeks apart generate the same project.
 */
export const REGISTRY_REF = process.env.PARTWEAVE_REGISTRY_REF?.trim() || "main";

/** Per-ref cache dir, so pinning to a tag never collides with the `main` clone. */
export const REGISTRY_DIR = join(
  homedir(),
  ".partweave",
  "registry",
  // Refs can contain `/` (e.g. `release/1.0`); keep the cache path a single segment.
  REGISTRY_REF.replace(/[/\\]/g, "-"),
);

export function ensureRegistry(forceUpdate = false): void {
  const gitDir = join(REGISTRY_DIR, ".git");

  if (!existsSync(gitDir)) {
    console.log(pc.cyan(`Downloading Partweave registry (${REGISTRY_REF}) from GitHub...`));
    mkdirSync(REGISTRY_DIR, { recursive: true });
    try {
      // --branch takes a branch OR a tag; --depth 1 keeps it a shallow, fast clone.
      execSync(`git clone --depth 1 --branch ${REGISTRY_REF} ${REGISTRY_URL} .`, {
        cwd: REGISTRY_DIR,
        stdio: "ignore",
      });
      console.log(pc.green(`✔ Registry downloaded successfully.`));
    } catch (err: any) {
      throw new PartweaveError(
        "fetch-failed",
        `Failed to clone registry (${REGISTRY_REF}) from ${REGISTRY_URL}: ${err.message}`,
      );
    }
  } else if (forceUpdate) {
    console.log(pc.cyan(`Updating Partweave registry (${REGISTRY_REF})...`));
    try {
      // fetch + reset works for a branch, tag, or commit alike (a plain `git pull`
      // fails on a detached tag checkout).
      execSync(`git fetch --depth 1 origin ${REGISTRY_REF}`, { cwd: REGISTRY_DIR, stdio: "ignore" });
      execSync(`git reset --hard FETCH_HEAD`, { cwd: REGISTRY_DIR, stdio: "ignore" });
      console.log(pc.green(`✔ Registry updated successfully.`));
    } catch (err: any) {
      throw new PartweaveError(
        "update-failed",
        `Failed to update registry (${REGISTRY_REF}): ${err.message}. Check your internet connection.`,
      );
    }
  }
}
