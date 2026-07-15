import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PartweaveError } from "./errors.js";
import { Registry } from "./registry.js";
import { resolveModules, validateApps } from "./resolve.js";

// A synthetic on-disk fixtures registry: the real catalog is too coupled to
// exercise requiresOneOf / the empty-contribution check in isolation.
const dir = mkdtempSync(join(tmpdir(), "pw-req-"));
const mod = (m: Record<string, unknown>) => {
  const d = join(dir, m.id as string);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "module.json"), JSON.stringify(m));
};

// Client-only module (like `example`): places files/wiring only on web/mobile.
// requiresOneOf makes "needs a client" explicit; the empty-contribution check
// catches a server-only selection where it can place nothing. (Wiring is
// present so the module is coherent per the load-time contract check.)
mod({
  id: "client-only",
  title: "Client only",
  targets: ["web", "mobile"],
  requiresOneOf: [["web", "mobile"]],
  wiring: { web: { routes: ["/x"] }, mobile: { routes: ["/x"] } },
});
// A disjunctive requirement on a module that lives purely on root (root is
// always present, so requiresOneOf is the only thing that can fail here).
mod({
  id: "needs-a-client",
  title: "Needs a client",
  targets: ["root"],
  requiresOneOf: [["web", "mobile"]],
});
// A plain server module — no disjunction, contributes to server.
mod({
  id: "server-thing",
  title: "Server thing",
  targets: ["server"],
  requiresApps: ["server"],
  wiring: { server: { installedApps: ["server_thing"] } },
});

const registry = new Registry(dir);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const catch_ = (fn: () => void): PartweaveError => {
  try {
    fn();
  } catch (err) {
    return err as PartweaveError;
  }
  throw new Error("expected validateApps to throw");
};

describe("validateApps — requiresOneOf", () => {
  it("passes when at least one app in the group is present", () => {
    expect(() => validateApps(registry, ["needs-a-client"], ["web"])).not.toThrow();
    expect(() => validateApps(registry, ["needs-a-client"], ["mobile"])).not.toThrow();
    expect(() => validateApps(registry, ["needs-a-client"], ["web", "mobile"])).not.toThrow();
  });

  it("throws missing-app when no app in the group is present", () => {
    const err = catch_(() => validateApps(registry, ["needs-a-client"], ["server"]));
    expect(err).toBeInstanceOf(PartweaveError);
    expect(err.kind).toBe("missing-app");
    expect(err.message).toMatch(/at least one of: web, mobile/);
    const missing = err.details?.missing as { module: string; oneOf?: string[] }[];
    expect(missing.some((m) => m.module === "needs-a-client" && m.oneOf?.includes("web"))).toBe(true);
  });
});

describe("validateApps — empty-contribution check", () => {
  it("rejects a client-only module in a server-only project (silent no-op)", () => {
    // server-only: present targets are {root, server}; client-only targets
    // {web, mobile} — no overlap, so it would place nothing.
    const err = catch_(() => validateApps(registry, ["client-only"], ["server"]));
    expect(err).toBeInstanceOf(PartweaveError);
    expect(err.kind).toBe("missing-app");
    expect(err.message).toMatch(/contributes only to web, mobile/);
    const missing = err.details?.missing as { module: string; targets?: string[] }[];
    expect(missing.some((m) => m.module === "client-only" && m.targets?.includes("web"))).toBe(true);
  });

  it("accepts the same module once a client target is present", () => {
    expect(() => validateApps(registry, ["client-only"], ["server", "web"])).not.toThrow();
  });

  it("still enforces the plain requiresApps AND check", () => {
    const err = catch_(() => validateApps(registry, ["server-thing"], ["web"]));
    expect(err.kind).toBe("missing-app");
    // web-only has no server → requiresApps fails AND contribution fails; both reported.
    expect(err.message).toMatch(/needs the server app/);
  });

  it("passes a well-formed selection cleanly", () => {
    expect(() => validateApps(registry, ["server-thing"], ["server"])).not.toThrow();
  });
});

describe("real catalog — example module", () => {
  const real = new Registry();

  it("rejects example in a server-only selection (the verified bug)", () => {
    const { modules } = resolveModules(real, ["example"]);
    const err = catch_(() => validateApps(real, modules, ["server"]));
    expect(err.kind).toBe("missing-app");
    expect(err.message).toMatch(/example/);
  });

  it("accepts example with a server + web client", () => {
    const { modules } = resolveModules(real, ["example"]);
    expect(() => validateApps(real, modules, ["server", "web"])).not.toThrow();
  });
});
