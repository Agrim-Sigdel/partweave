import { describe, expect, it } from "vitest";
import { serializeCatalog } from "./catalog.js";
import { EXIT_CODES, PartweaveError, toPartweaveError } from "./errors.js";
import { ENVELOPE_VERSION, errEnvelope, okEnvelope } from "./output.js";
import { readVersion } from "./paths.js";
import { Registry } from "./registry.js";
import { resolveModules, validateApps } from "./resolve.js";

describe("error taxonomy", () => {
  it("maps each kind to its stable exit code", () => {
    expect(new PartweaveError("usage", "x").exitCode).toBe(2);
    expect(new PartweaveError("unknown-module", "x").exitCode).toBe(3);
    expect(new PartweaveError("conflict", "x").exitCode).toBe(4);
    expect(new PartweaveError("missing-app", "x").exitCode).toBe(5);
    expect(new PartweaveError("dir-exists", "x").exitCode).toBe(6);
    expect(new PartweaveError("not-a-project", "x").exitCode).toBe(7);
    expect(new PartweaveError("internal", "x").exitCode).toBe(1);
  });

  it("passes a PartweaveError through, wraps anything else as internal", () => {
    const pe = new PartweaveError("conflict", "boom");
    expect(toPartweaveError(pe)).toBe(pe);
    const wrapped = toPartweaveError(new Error("nope"));
    expect(wrapped.kind).toBe("internal");
    expect(wrapped.message).toBe("nope");
    expect(toPartweaveError("string error").message).toBe("string error");
  });

  it("carries structured details", () => {
    const pe = new PartweaveError("unknown-module", "Unknown module: \"x\"", { id: "x" });
    expect(pe.details).toEqual({ id: "x" });
    expect(EXIT_CODES["unknown-module"]).toBe(3);
  });
});

describe("JSON envelope", () => {
  it("builds a versioned ok envelope", () => {
    expect(okEnvelope("list", { a: 1 })).toEqual({
      ok: true,
      v: ENVELOPE_VERSION,
      command: "list",
      data: { a: 1 },
    });
  });

  it("builds an err envelope with kind, exit code, and details", () => {
    const env = errEnvelope("plan", new PartweaveError("missing-app", "no server", { missing: [] }));
    expect(env).toEqual({
      ok: false,
      v: ENVELOPE_VERSION,
      command: "plan",
      error: { kind: "missing-app", message: "no server", exitCode: 5, details: { missing: [] } },
    });
  });

  it("omits details when absent", () => {
    const env = errEnvelope("create", new PartweaveError("usage", "bad flag"));
    expect(env.error).not.toHaveProperty("details");
  });
});

describe("resolver throws typed errors (for the taxonomy)", () => {
  const registry = new Registry();

  it("unknown module → unknown-module", () => {
    try {
      resolveModules(registry, ["does-not-exist"]);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PartweaveError);
      expect((err as PartweaveError).kind).toBe("unknown-module");
      expect((err as PartweaveError).details).toEqual({ id: "does-not-exist" });
    }
  });

  it("requiresApps unmet → missing-app with structured detail", () => {
    const { modules } = resolveModules(registry, ["auth"]);
    try {
      validateApps(registry, modules, ["web"]);
      expect.unreachable();
    } catch (err) {
      expect((err as PartweaveError).kind).toBe("missing-app");
      const missing = (err as PartweaveError).details?.missing as { app: string }[];
      expect(missing.some((m) => m.app === "server")).toBe(true);
    }
  });
});

describe("catalog serialization (list --json)", () => {
  const catalog = serializeCatalog(new Registry());

  it("lists the three apps", () => {
    expect(catalog.apps).toEqual(["server", "web", "mobile"]);
  });

  it("serializes each feature module with the fields an agent needs", () => {
    const auth = catalog.modules.find((m) => m.id === "auth");
    expect(auth).toBeDefined();
    expect(auth!.targets).toEqual(expect.arrayContaining(["server"]));
    expect(auth!.requires).toContain("db-postgres");
    expect(auth!.provides).toBe("auth");
    expect(auth!.requiresApps).toContain("server");
  });

  it("is id-sorted and stable", () => {
    const ids = catalog.modules.map((m) => m.id);
    expect(ids).toEqual([...ids].sort());
  });
});

describe("--version single-sources from package.json (F36)", () => {
  it("reads a real semver, not the old hardcoded 0.1.0", () => {
    const v = readVersion();
    expect(v).toMatch(/^\d+\.\d+\.\d+/);
    expect(v).not.toBe("0.1.0");
  });
});
