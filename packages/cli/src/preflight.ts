import { spawnSync } from "node:child_process";
import { confirm, isCancel, log, spinner } from "@clack/prompts";
import {
  hasCommand,
  jsPmInstallPlan,
  pyPmInstallPlan,
  type InstallPlan,
  type JsPm,
  type PyPm,
} from "./pm.js";

/**
 * Make sure the package manager the user picked is actually installed. When it
 * isn't, offer to install it (interactively) or auto-install (`--install`), and
 * otherwise fall back to the manager that always ships — npm / pip — so a
 * missing pnpm/uv never produces a broken project or hangs a script.
 */
export interface EnsureOptions {
  /** prompt the user before installing (false in `--yes` / flag-driven runs) */
  interactive: boolean;
  /** in non-interactive mode, install the missing PM without asking */
  install?: boolean;
}

/** Run an install plan behind a spinner; returns whether the tool is now present. */
function runInstall(plan: InstallPlan, probe: string): boolean {
  const s = spinner();
  s.start(plan.label);
  const r = spawnSync(plan.cmd, plan.args, {
    stdio: ["ignore", "ignore", "inherit"],
    shell: process.platform === "win32",
  });
  const ok = r.status === 0 && hasCommand(probe);
  s.stop(ok ? `${probe} is ready` : `Could not install ${probe}`);
  return ok;
}

/** Generic ensure: chosen → installed if possible, else the always-present fallback. */
async function ensurePm<T extends string>(
  chosen: T,
  fallback: T,
  plan: InstallPlan | null,
  opts: EnsureOptions,
): Promise<T> {
  if (hasCommand(chosen)) return chosen;
  // npm/pip have no install plan and always exist — nothing to do.
  if (!plan) return chosen;

  let doInstall = opts.install === true;
  if (opts.interactive) {
    const answer = await confirm({
      message: `${chosen} isn't installed. Install it now?  (${plan.hint})`,
    });
    // A cancel (Ctrl-C) or "no" both mean: don't install, fall back.
    doInstall = !isCancel(answer) && answer === true;
  }

  if (doInstall && runInstall(plan, chosen)) return chosen;

  log.warn(
    `Using ${fallback} instead of ${chosen}. To use ${chosen} later, run:  ${plan.hint}`,
  );
  return fallback;
}

export function ensureJsPm(pm: JsPm, opts: EnsureOptions): Promise<JsPm> {
  return ensurePm<JsPm>(pm, "npm", jsPmInstallPlan(pm), opts);
}

export function ensurePyPm(pm: PyPm, opts: EnsureOptions): Promise<PyPm> {
  return ensurePm<PyPm>(pm, "pip", pyPmInstallPlan(pm), opts);
}
