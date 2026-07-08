import {
  cancel,
  confirm,
  isCancel,
  multiselect,
  select,
  text,
} from "@clack/prompts";
import pc from "picocolors";
import { resolve } from "node:path";
import {
  detectJsPm,
  detectPyPm,
  hasCommand,
  type JsPm,
  type PyPm,
} from "./pm.js";
import type { Registry } from "./registry.js";
import { slugify } from "./render.js";
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
): Promise<RawChoices> {
  const nameRaw = await text({
    message: "Project name",
    placeholder: "my-project",
    initialValue: defaults.projectName ?? "",
    validate: (v) => (v.trim() ? undefined : "Required"),
  });
  bail(nameRaw);
  const projectName = nameRaw.trim();

  const dirRaw = await text({
    message: "Target directory",
    initialValue: defaults.outDir ?? `./${slugify(projectName)}`,
    validate: (v) => (v.trim() ? undefined : "Required"),
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

  const ok = await confirm({
    message: `Scaffold ${apps.join(" + ")}${modules.length ? " with " + modules.join(", ") : ""} into ${outDir}?`,
  });
  bail(ok);
  if (!ok) {
    cancel("Cancelled.");
    process.exit(0);
  }

  return { projectName, outDir, apps, modules, jsPm, pyPm };
}
