import {
  cancel,
  confirm,
  isCancel,
  multiselect,
  note,
  select,
  text,
} from "@clack/prompts";
import pc from "picocolors";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  detectJsPm,
  detectPyPm,
  hasCommand,
  type JsPm,
  type PyPm,
} from "./pm.js";
import type { Registry } from "./registry.js";
import { projectNameError, slugify } from "./render.js";
import { APPS, type AppName, type TargetName } from "./types.js";

export interface RawChoices {
  projectName: string;
  outDir: string;
  apps: AppName[];
  modules: string[];
  jsPm: JsPm;
  pyPm: PyPm;
}

/** Controls hint for checkbox (multiselect) prompts. */
const MULTI_HINT = pc.dim("↑/↓ move · space toggle · a all · enter confirm");

function bail<T>(v: T | symbol): asserts v is T {
  if (isCancel(v)) {
    cancel("Cancelled.");
    process.exit(0);
  }
}

/** Interactive flow for `create`. */
export async function promptCreate(
  registry: Registry,
  defaults: Partial<RawChoices>,
  opts: { force?: boolean } = {},
): Promise<RawChoices> {
  const nameRaw = await text({
    message: "Project name",
    placeholder: "my-project",
    initialValue: defaults.projectName ?? "",
    validate: projectNameError,
  });
  bail(nameRaw);
  const projectName = nameRaw.trim();

  const dirRaw = await text({
    message: "Target directory",
    initialValue: defaults.outDir ?? `./${slugify(projectName)}`,
    // Reject an occupied target here, at the prompt, instead of letting the
    // user answer every remaining question and then fail on the dir guard.
    // --force skips this — the user has already said they want to replace it.
    validate: (v) => {
      if (!v.trim()) return "Required";
      if (opts.force) return undefined;
      const dir = resolve(v.trim());
      try {
        if (existsSync(dir) && readdirSync(dir).length > 0) {
          return `${dir} already exists and is not empty — pick another directory (or rerun with --force).`;
        }
      } catch {
        // Unreadable path (permissions, etc.) — let `create` surface the real io error.
      }
      return undefined;
    },
  });
  bail(dirRaw);
  const outDir = resolve(dirRaw.trim());

  const appsRaw = await multiselect({
    message: `Which apps?  ${MULTI_HINT}`,
    options: [
      { value: "server", label: "Server", hint: "Django + DRF" },
      { value: "web", label: "Web", hint: "Next.js" },
      { value: "mobile", label: "Mobile", hint: "Expo / React Native" },
    ],
    initialValues: (defaults.apps as string[]) ?? [...APPS],
    required: true,
  });
  bail(appsRaw);
  const apps = appsRaw as AppName[];

  // only offer components relevant to (and compatible with) the chosen apps
  const present = new Set<TargetName>(apps);
  if (apps.includes("web") || apps.includes("mobile")) present.add("shared");
  const relevant = registry
    .features()
    .filter((m) => m.manifest.targets.some((t) => present.has(t)))
    .filter((m) => m.manifest.requiresApps.every((a) => apps.includes(a)));

  let modules: string[] = [];
  if (relevant.length) {
    const modsRaw = await multiselect({
      message: `Which components? (deps auto-added)  ${MULTI_HINT}`,
      options: relevant.map((m) => ({
        value: m.manifest.id,
        label: m.manifest.title,
        hint: m.manifest.description,
      })),
      initialValues: relevant
        .filter((m) => m.manifest.default)
        .map((m) => m.manifest.id),
      required: false,
    });
    bail(modsRaw);
    modules = modsRaw as string[];
  }

  // Package managers — default to an explicit flag, else what's installed.
  const anyJs = apps.includes("web") || apps.includes("mobile");
  let jsPm: JsPm = defaults.jsPm ?? detectJsPm();
  if (anyJs) {
    const jsRaw = await select({
      message: "JS/TS package manager",
      initialValue: jsPm,
      options: [
        { value: "pnpm", label: "pnpm", hint: hasCommand("pnpm") ? "detected" : "not found on PATH" },
        { value: "npm", label: "npm", hint: "ships with Node" },
      ],
    });
    bail(jsRaw);
    jsPm = jsRaw as JsPm;
  }

  let pyPm: PyPm = defaults.pyPm ?? detectPyPm();
  if (apps.includes("server")) {
    const pyRaw = await select({
      message: "Python package manager (server)",
      initialValue: pyPm,
      options: [
        { value: "uv", label: "uv", hint: hasCommand("uv") ? "detected · fast" : "not found on PATH" },
        { value: "pip", label: "pip + venv", hint: "ships with Python" },
      ],
    });
    bail(pyRaw);
    pyPm = pyRaw as PyPm;
  }

  const row = (k: string, v: string) => `${pc.dim(k.padEnd(8))} ${v}`;
  const tooling = [anyJs ? jsPm : null, apps.includes("server") ? pyPm : null]
    .filter(Boolean)
    .join(pc.dim(" · "));
  note(
    [
      row("project", pc.bold(projectName)),
      row("where", outDir),
      row("apps", apps.join(pc.dim(" · "))),
      row("add-ons", modules.length ? modules.join(pc.dim(" · ")) : pc.dim("none")),
      row("tooling", tooling),
    ].join("\n"),
    "Review",
  );
  const ok = await confirm({ message: "Scaffold this?" });
  bail(ok);
  if (!ok) {
    cancel("Cancelled.");
    process.exit(0);
  }

  return { projectName, outDir, apps, modules, jsPm, pyPm };
}
