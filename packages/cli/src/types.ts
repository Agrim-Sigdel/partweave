import { z } from "zod";

/**
 * A "target" is a destination sub-project inside the generated monorepo.
 * `_core/<target>/` holds the bare scaffold; every module contributes files
 * and wiring per target.
 */
export const TARGETS = [
  "root",
  "server",
  "web",
  "mobile",
  "shared",
  "api-client",
] as const;
export type TargetName = (typeof TARGETS)[number];

/** Where each target's files land in the generated project. */
export const TARGET_DEST: Record<TargetName, string> = {
  root: ".",
  server: "apps/server",
  web: "apps/web",
  mobile: "apps/mobile",
  shared: "packages/shared",
  "api-client": "packages/api-client",
};

/** The three user-facing "apps" that can be toggled on/off. */
export const APPS = ["server", "web", "mobile"] as const;
export type AppName = (typeof APPS)[number];

/**
 * Named convenience wiring fields map to well-known anchors in the _core
 * scaffolds. `<base:installed-apps>` etc. `anchors` is the generic escape hatch.
 */
const WiringForTargetSchema = z.object({
  installedApps: z.array(z.string()).optional(), // server → <base:installed-apps>
  urls: z.array(z.string()).optional(), // server → <base:urls>
  settings: z.array(z.string()).optional(), // server → <base:settings>
  providers: z.array(z.string()).optional(), // web/mobile → <base:providers>
  routes: z.array(z.string()).optional(), // web/mobile → <base:routes>
  deps: z.array(z.string()).optional(), // merged into pyproject/package.json
  anchors: z.record(z.array(z.string())).optional(), // generic anchorId → lines
});
export type WiringForTarget = z.infer<typeof WiringForTargetSchema>;

/** Maps a convenience field name to its well-known anchor id. */
export const CONVENIENCE_ANCHORS: Record<string, string> = {
  installedApps: "installed-apps",
  urls: "urls",
  settings: "settings",
  providers: "providers",
  routes: "routes",
};

export const ManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "id must be kebab-case"),
  title: z.string(),
  description: z.string().optional(),
  /** "app" = a top-level toggle (server/web/mobile); "feature" = a component. */
  kind: z.enum(["app", "feature"]).default("feature"),
  /** which target sub-projects this module contributes to */
  targets: z.array(z.enum(TARGETS)).min(1),
  /** apps that MUST be selected for this module to work (e.g. auth needs server) */
  requiresApps: z.array(z.enum(APPS)).default([]),
  /** modules that must also be present (auto-selected) */
  requires: z.array(z.string()).default([]),
  /** modules that cannot coexist with this one */
  conflicts: z.array(z.string()).default([]),
  /** capability/interface this module satisfies (for conflict grouping) */
  provides: z.string().optional(),
  /** env keys → default value, appended to .env.example */
  env: z.record(z.string()).default({}),
  /** per-target wiring (files are copied separately from wiring injection) */
  wiring: z.record(z.enum(TARGETS), WiringForTargetSchema).default({}),
  /** whether this module is offered by default in the interactive picker */
  default: z.boolean().default(false),
  /** notes printed after generation */
  notes: z.array(z.string()).default([]),
});
export type Manifest = z.infer<typeof ManifestSchema>;

/** A manifest plus its absolute directory on disk. */
export interface Module {
  manifest: Manifest;
  dir: string;
}

/** The fully-resolved choice the composer acts on. */
export interface Selection {
  projectName: string;
  /** absolute output directory */
  outDir: string;
  /** chosen apps */
  apps: AppName[];
  /** chosen feature module ids (already dependency-resolved) */
  modules: string[];
}

/** Template variables available to every copied text file via {{token}}. */
export interface RenderContext {
  projectName: string;
  projectSlug: string;
  description: string;
  apps: AppName[];
  hasServer: boolean;
  hasWeb: boolean;
  hasMobile: boolean;
  hasShared: boolean;
  hasApiClient: boolean;
}
