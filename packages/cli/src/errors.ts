/**
 * Typed error taxonomy (F24). Every expected failure carries a `kind` that maps
 * to a stable process exit code, so an agent driving the CLI can branch on the
 * outcome without scraping human-readable messages. Unexpected throws surface as
 * `internal` (exit 1).
 */

export type ErrorKind =
  | "usage" // bad flags/arguments
  | "unknown-module" // an id that isn't in the catalog
  | "conflict" // two modules conflict, share a `provides`, or form a require cycle
  | "missing-app" // a module's `requiresApps` isn't in the selected apps
  | "dir-exists" // target directory exists and is non-empty (no --force)
  | "not-a-project" // add/plan run outside a generated project
  | "io" // filesystem / spawn failure
  | "not-found" // a referenced path/resource doesn't exist (e.g. extract --from)
  | "fetch-failed" // couldn't download the remote module registry
  | "update-failed" // couldn't update the cached module registry
  | "missing-anchor" // a <partweave:...> wiring anchor is absent from the target files
  | "internal"; // anything unexpected

/** kind → process exit code. Stable: treat these as an API, don't renumber. */
export const EXIT_CODES: Record<ErrorKind, number> = {
  internal: 1,
  usage: 2,
  "unknown-module": 3,
  conflict: 4,
  "missing-app": 5,
  "dir-exists": 6,
  "not-a-project": 7,
  io: 8,
  "not-found": 9,
  "fetch-failed": 10,
  "update-failed": 11,
  "missing-anchor": 12,
};

/** An expected, typed failure. `details` is serialized into the JSON error envelope. */
export class PartweaveError extends Error {
  readonly kind: ErrorKind;
  readonly details?: Record<string, unknown>;

  constructor(kind: ErrorKind, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "PartweaveError";
    this.kind = kind;
    this.details = details;
  }

  get exitCode(): number {
    return EXIT_CODES[this.kind];
  }
}

/** Coerce any thrown value into a PartweaveError (unknown → `internal`). */
export function toPartweaveError(err: unknown): PartweaveError {
  if (err instanceof PartweaveError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new PartweaveError("internal", message);
}

/** errno codes that mean "environment problem" (permissions, disk, paths) — not a partweave bug. */
const IO_CODES = new Set([
  "EACCES",
  "EBUSY",
  "EEXIST",
  "EMFILE",
  "ENFILE",
  "ENOENT",
  "ENOSPC",
  "ENOTDIR",
  "ENOTEMPTY",
  "EPERM",
  "EROFS",
  "EXDEV",
]);

/**
 * Coerce a thrown value into a PartweaveError, classifying recognizable
 * filesystem errno failures as `io` (exit 8) with `action` as context instead
 * of letting them surface as `internal`. PartweaveErrors pass through untouched.
 */
export function toIoError(err: unknown, action: string): PartweaveError {
  if (err instanceof PartweaveError) return err;
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string" && IO_CODES.has(code)) {
    return new PartweaveError("io", `${action}: ${(err as Error).message}`, { code });
  }
  return toPartweaveError(err);
}
