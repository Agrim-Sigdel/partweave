/**
 * The machine-readable output contract (F7). Every command that supports `--json`
 * prints exactly one versioned envelope to **stdout** and nothing else there;
 * human-facing chatter (clack UI, logs) goes to **stderr**, so stdout is always
 * clean JSON an agent can parse.
 *
 *   success → { ok: true,  v, command, data }
 *   failure → { ok: false, v, command, error: { kind, message, exitCode, details? } }
 */

import { PartweaveError, toPartweaveError } from "./errors.js";

/** Bump when the envelope shape changes in a breaking way. */
export const ENVELOPE_VERSION = 1;

export interface OkEnvelope<T> {
  ok: true;
  v: number;
  command: string;
  data: T;
}

export interface ErrEnvelope {
  ok: false;
  v: number;
  command: string;
  error: {
    kind: PartweaveError["kind"];
    message: string;
    exitCode: number;
    details?: Record<string, unknown>;
  };
}

export function okEnvelope<T>(command: string, data: T): OkEnvelope<T> {
  return { ok: true, v: ENVELOPE_VERSION, command, data };
}

export function errEnvelope(command: string, err: PartweaveError): ErrEnvelope {
  return {
    ok: false,
    v: ENVELOPE_VERSION,
    command,
    error: {
      kind: err.kind,
      message: err.message,
      exitCode: err.exitCode,
      ...(err.details ? { details: err.details } : {}),
    },
  };
}

function writeJson(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

/**
 * Emit a success result. In `--json` mode writes the ok-envelope to stdout; in
 * human mode runs `human()` (clack UI, notes, etc.) instead.
 */
export function emitSuccess<T>(
  command: string,
  json: boolean,
  data: T,
  human?: () => void,
): void {
  if (json) writeJson(okEnvelope(command, data));
  else human?.();
}

/**
 * Emit a failure and exit with the error's stable code. In `--json` mode writes
 * the err-envelope to stdout (so an agent gets structured output even on error);
 * in human mode prints the message to stderr.
 */
export function emitError(command: string, json: boolean, err: unknown): never {
  const pe = toPartweaveError(err);
  if (json) writeJson(errEnvelope(command, pe));
  else console.error(pe.message);
  process.exit(pe.exitCode);
}
