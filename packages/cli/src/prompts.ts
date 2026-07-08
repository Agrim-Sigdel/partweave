import {
  cancel,
  confirm,
  isCancel,
  multiselect,
  text,
} from "@clack/prompts";
import { resolve } from "node:path";
import type { Registry } from "./registry.js";
import { slugify } from "./render.js";
import { APPS, type AppName, type TargetName } from "./types.js";

export interface RawChoices {
  projectName: string;
  outDir: string;
  apps: AppName[];
  modules: string[];
}

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
    message: "Which apps?",
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
      message: "Which components? (dependencies are added automatically)",
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

  const ok = await confirm({
    message: `Scaffold ${apps.join(" + ")}${modules.length ? " with " + modules.join(", ") : ""} into ${outDir}?`,
  });
  bail(ok);
  if (!ok) {
    cancel("Cancelled.");
    process.exit(0);
  }

  return { projectName, outDir, apps, modules };
}
