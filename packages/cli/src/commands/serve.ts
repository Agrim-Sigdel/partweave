/**
 * `partweave serve` — start the Jev-powered classification API server.
 *
 * Spawns `python manage.py runserver` inside packages/api/, checking for
 * Python and Django availability first. The API serves a mock UI at / and
 * JSON endpoints at /api/*.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn, execSync } from "node:child_process";
import pc from "picocolors";
import { findPackagesRoot } from "../paths.js";

export interface ServeFlags {
  port?: number;
  host?: string;
}

function findPython(apiDir: string): string | null {
  // Prefer the venv inside packages/api/ — avoids system Python version
  // mismatches (e.g. macOS ships 3.8 but Django 5 needs 3.10+).
  const venvPython = join(apiDir, ".venv", "bin", "python");
  if (existsSync(venvPython)) {
    try {
      const version = execSync(`${venvPython} --version`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      if (version.includes("Python 3")) return venvPython;
    } catch {
      // Fall through to system Python.
    }
  }

  for (const cmd of ["python3", "python"]) {
    try {
      const version = execSync(`${cmd} --version`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      if (version.includes("Python 3")) return cmd;
    } catch {
      // Not found, try next.
    }
  }
  return null;
}

function checkDjango(python: string): boolean {
  try {
    execSync(`${python} -c "import django"`, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

export async function runServe(flags: ServeFlags): Promise<void> {
  const port = flags.port ?? 8000;
  const host = flags.host ?? "127.0.0.1";

  // Locate packages/api/ relative to the CLI package root.
  const packagesRoot = findPackagesRoot();
  const apiDir = join(packagesRoot, "api");

  if (!existsSync(join(apiDir, "manage.py"))) {
    console.error(
      pc.red("✗") +
        " Could not find packages/api/manage.py. " +
        pc.dim("Are you running from the partweave repo root?"),
    );
    process.exit(1);
  }

  // Check Python.
  const python = findPython(apiDir);
  if (!python) {
    console.error(
      pc.red("✗") +
        " Python 3 not found. Install Python 3.10+ to use the classification server.",
    );
    process.exit(1);
  }

  // Check Django.
  if (!checkDjango(python)) {
    console.log(
      pc.yellow("⚠") +
        " Django not installed. Installing dependencies...",
    );
    try {
      execSync(`${python} -m pip install -r ${join(apiDir, "requirements.txt")}`, {
        stdio: "inherit",
      });
    } catch {
      console.error(
        pc.red("✗") +
          " Failed to install Python dependencies. Try manually:\n" +
          pc.dim(`  ${python} -m pip install -r packages/api/requirements.txt`),
      );
      process.exit(1);
    }
  }

  const addr = `${host}:${port}`;
  console.log();
  console.log(
    pc.bold("  partweave") + pc.dim(" classification server"),
  );
  console.log();
  console.log(
    `  ${pc.green("➜")}  Mock UI:  ${pc.cyan(`http://${addr}/`)}`,
  );
  console.log(
    `  ${pc.green("➜")}  API:     ${pc.cyan(`http://${addr}/api/classify`)}`,
  );
  console.log(
    `  ${pc.green("➜")}  Catalog: ${pc.cyan(`http://${addr}/api/catalog`)}`,
  );
  console.log();

  const hasKey = !!process.env.TYPESAFE_API_KEY;
  if (hasKey) {
    console.log(
      `  ${pc.green("●")} Jev (TypeSafe AI) — API key detected`,
    );
  } else {
    console.log(
      `  ${pc.yellow("●")} Keyword fallback — set ${pc.bold("TYPESAFE_API_KEY")} for Jev`,
    );
  }
  console.log();

  // Spawn Django dev server.
  const child = spawn(
    python,
    ["manage.py", "runserver", addr, "--noreload"],
    {
      cwd: apiDir,
      stdio: "inherit",
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    },
  );

  child.on("error", (err) => {
    console.error(pc.red("✗") + ` Failed to start server: ${err.message}`);
    process.exit(1);
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  // Forward signals so Ctrl-C cleanly stops the server.
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      child.kill(sig);
    });
  }
}
