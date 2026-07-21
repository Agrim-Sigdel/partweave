import { execSync, type ExecSyncOptions } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
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

/**
 * Set once the registry cache has been cloned or refreshed in this process.
 * The catalog now ships inside the package, so the bundled copy is what
 * `findModulesDir()` normally finds. When the user explicitly asks for a newer
 * catalog (`--update`), the freshly fetched one must win over the bundled one —
 * otherwise the download happens and is then silently ignored.
 */
let refreshed = false;
export function registryWasRefreshed(): boolean {
  return refreshed;
}

/** git's own stderr, which says *why* it failed — the part users actually need. */
function gitStderr(err: any): string {
  const detail = String(err?.stderr ?? "").trim();
  if (detail) return detail;
  // ENOENT from the shell means git isn't installed at all.
  return /not found|ENOENT/i.test(String(err?.message ?? ""))
    ? "git is not installed, or not on your PATH."
    : String(err?.message ?? "unknown error");
}

export function ensureRegistry(forceUpdate = false): void {
  // Gate on the catalog itself, not on `.git`. A clone interrupted partway
  // (Ctrl-C, dropped connection) leaves `.git` behind with no modules/ — and
  // gating on `.git` would then skip the re-clone forever, leaving the user
  // permanently broken with no way to recover short of deleting the cache.
  const haveCatalog = existsSync(join(REGISTRY_DIR, "modules", "_core"));

  if (!haveCatalog) {
    console.log(pc.cyan(`Downloading Partweave registry (${REGISTRY_REF}) from GitHub...`));
    // Clone into a sibling temp dir and swap it in only once it's complete, so
    // a failed clone leaves nothing half-written behind to poison the retry.
    const staging = `${REGISTRY_DIR}.tmp`;
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    try {
      // --branch takes a branch OR a tag; --depth 1 keeps it a shallow, fast clone.
      execSync(`git clone --depth 1 --branch ${REGISTRY_REF} ${REGISTRY_URL} .`, {
        cwd: staging,
        stdio: ["ignore", "ignore", "pipe"],
      });
      rmSync(REGISTRY_DIR, { recursive: true, force: true });
      mkdirSync(dirname(REGISTRY_DIR), { recursive: true });
      renameSync(staging, REGISTRY_DIR);
      refreshed = true;
      console.log(pc.green(`✔ Registry downloaded successfully.`));
    } catch (err: any) {
      rmSync(staging, { recursive: true, force: true });
      throw new PartweaveError(
        "fetch-failed",
        `Failed to clone registry (${REGISTRY_REF}) from ${REGISTRY_URL}: ${gitStderr(err)}`,
      );
    }
  } else if (forceUpdate) {
    console.log(pc.cyan(`Updating Partweave registry (${REGISTRY_REF})...`));
    try {
      // fetch + reset works for a branch, tag, or commit alike (a plain `git pull`
      // fails on a detached tag checkout).
      const opts: ExecSyncOptions = {
        cwd: REGISTRY_DIR,
        stdio: ["ignore", "ignore", "pipe"],
      };
      execSync(`git fetch --depth 1 origin ${REGISTRY_REF}`, opts);
      execSync(`git reset --hard FETCH_HEAD`, opts);
      refreshed = true;
      console.log(pc.green(`✔ Registry updated successfully.`));
    } catch (err: any) {
      throw new PartweaveError(
        "update-failed",
        `Failed to update registry (${REGISTRY_REF}): ${gitStderr(err)}`,
      );
    }
  } else {
    // Cache already present and no refresh asked for.
    refreshed = true;
  }
}
