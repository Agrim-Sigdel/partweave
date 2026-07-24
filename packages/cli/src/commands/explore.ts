import pc from "picocolors";
import { multiselect, isCancel, cancel } from "@clack/prompts";
import { serializeCatalog } from "../catalog.js";
import { emitError, emitSuccess } from "../output.js";
import { Registry } from "../registry.js";
import { runAdd } from "./add.js";

export interface ExploreFlags {
  json?: boolean;
}

/**
 * `partweave explore [--json]` — interactive module discovery and addition.
 * Shows changelogs and allows picking modules to install.
 */
export async function runExplore(flags: ExploreFlags): Promise<void> {
  const json = flags.json === true;
  try {
    const registry = new Registry();
    const catalog = serializeCatalog(registry);

    if (json) {
      // For agents: output the strict JSON schema with changelogs and options
      emitSuccess("explore", json, catalog);
      return;
    }

    // For humans: interactive CLI
    console.log(pc.bold("\nPartweave Feature Explorer\n"));

    const choices = catalog.modules.map((m) => {
      let description = m.description || "";
      if (m.changelog && m.changelog.length > 0) {
        const latest = m.changelog[0];
        description += `\n    ${pc.dim("Latest (" + latest.version + "): " + latest.changes[0])}`;
      }
      return {
        label: m.title ? `${m.title} ${pc.cyan("(" + m.id + ")")}` : m.id,
        hint: description,
        value: m.id,
      };
    });

    const response = await multiselect({
      message: "Select modules to add to your project",
      options: choices,
      required: false,
    });

    if (isCancel(response) || !response || (response as string[]).length === 0) {
      console.log(pc.dim("No modules selected. Exiting."));
      if (isCancel(response)) cancel("Cancelled.");
      return;
    }

    const selectedModules = response as string[];
    console.log(`\nAdding modules: ${pc.cyan(selectedModules.join(", "))}\n`);
    
    // We delegate the actual addition to runAdd
    await runAdd(selectedModules, {});

  } catch (err) {
    emitError("explore", json, err);
  }
}
