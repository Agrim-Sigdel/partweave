import pc from "picocolors";
import { serializeCatalog } from "../catalog.js";
import { emitError, emitSuccess } from "../output.js";
import { Registry } from "../registry.js";

export interface ListFlags {
  json?: boolean;
}

/**
 * `partweave list [--json]` — print the module catalog. Human mode is a readable
 * listing; `--json` emits the serialized registry in the standard envelope so an
 * agent can discover modules, their deps, conflicts, and env keys.
 */
export async function runList(flags: ListFlags): Promise<void> {
  const json = flags.json === true;
  try {
    const catalog = serializeCatalog(new Registry());
    emitSuccess("list", json, catalog, () => {
      console.log(pc.bold("\nApps") + pc.dim("  (toggle with --server/--web/--mobile)"));
      console.log("  " + catalog.apps.join(", "));
      console.log(pc.bold("\nComponents") + pc.dim(`  (${catalog.modules.length}, add with --with <id> or \`partweave add <id>\`)`));
      for (const m of catalog.modules) {
        const tags: string[] = [];
        if (m.provides) tags.push(`provides ${m.provides}`);
        if (m.requires.length) tags.push(`requires ${m.requires.join(", ")}`);
        if (m.conflicts.length) tags.push(`conflicts ${m.conflicts.join(", ")}`);
        if (m.default) tags.push("default");
        const suffix = tags.length ? pc.dim(`  [${tags.join(" · ")}]`) : "";
        console.log(`  ${pc.cyan(m.id.padEnd(14))} ${m.title}${suffix}`);
        if (m.description) console.log(pc.dim(`  ${" ".repeat(14)} ${m.description}`));
      }
      console.log();
    });
  } catch (err) {
    emitError("list", json, err);
  }
}
