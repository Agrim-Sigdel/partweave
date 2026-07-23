import { z } from "zod";
import type { JsPm, PyPm } from "./pm.js";

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
 * scaffolds. `<partweave:installed-apps>` etc. `anchors` is the generic escape hatch.
 */
const WiringForTargetSchema = z.object({
  installedApps: z.array(z.string()).optional(), // server → <partweave:installed-apps>
  urls: z.array(z.string()).optional(), // server → <partweave:urls>
  settings: z.array(z.string()).optional(), // server → <partweave:settings>
  providers: z.array(z.string()).optional(), // web/mobile → <partweave:providers>
  routes: z.array(z.string()).optional(), // web/mobile → <partweave:routes>
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
  /**
   * Disjunctive app requirements: each inner array is an OR-group ("at least one
   * of these apps must be present"). All groups must be satisfied (AND across
   * groups, OR within a group). Use this when `requiresApps` (a flat AND) is too
   * strict — e.g. `[["web", "mobile"]]` means "needs a web OR mobile client".
   * Distinct from `targets`: `targets` says where files land; this gates whether
   * the module may be selected at all.
   */
  requiresOneOf: z.array(z.array(z.enum(APPS))).default([]),
  /** modules that must also be present (auto-selected) */
  requires: z.array(z.string()).default([]),
  /** modules that cannot coexist with this one */
  conflicts: z.array(z.string()).default([]),
  /** capability/interface this module satisfies (for conflict grouping) */
  provides: z.string().optional(),
  /** env keys → default value; routed to the consuming app's .env/.env.example by prefix (POSTGRES_→root, NEXT_PUBLIC_→web, EXPO_PUBLIC_→mobile, else server) */
  env: z.record(z.string()).default({}),
  /** per-target wiring (files are copied separately from wiring injection) */
  wiring: z.record(z.enum(TARGETS), WiringForTargetSchema).default({}),
  /**
   * Soft-join wiring, keyed by capability. `enhances[cap]` is applied ONLY when
   * some *other* present module `provides` that capability — so `feedback` can
   * declare `enhances: { auth: { server: { ... } } }` and gain user attribution
   * whenever any auth provider is installed, without hard-requiring auth. Keyed
   * on capability (not module id) so it works with any provider of it. The set
   * of active enhancements is a pure function of which modules end up installed,
   * so `create --with a,b`, `create --with a` + `add b`, and `create --with b` +
   * `add a` all converge to the same wiring. Injected idempotently at anchors,
   * exactly like `wiring`.
   */
  enhances: z
    .record(z.string(), z.record(z.enum(TARGETS), WiringForTargetSchema))
    .default({}),
  /** whether this module is offered by default in the interactive picker */
  default: z.boolean().default(false),
  /** options that allow conditional extraction */
  options: z.record(z.object({
    type: z.enum(["boolean", "string"]),
    default: z.union([z.boolean(), z.string()]),
    description: z.string().optional()
  })).default({}),
  /** notes printed after generation */
  notes: z.array(z.string()).default([]),
});
export type Manifest = z.infer<typeof ManifestSchema>;

/** A manifest plus its absolute directory on disk. */
export interface Module {
  manifest: Manifest;
  dir: string;
  changelog?: Array<{ version: string; changes: string[] }>;
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
  /** JS/TS package manager for the workspace (defaults to pnpm) */
  jsPm?: JsPm;
  /** Python package manager for the server (defaults to uv) */
  pyPm?: PyPm;
  /** Chosen module options, keyed by module ID */
  options?: Record<string, Record<string, string | boolean>>;
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
  /** JS/TS package manager (pnpm | npm) */
  jsPm: JsPm;
  /** Python package manager (uv | pip) */
  pyPm: PyPm;
}
