import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildContext, compose, selectedTargets } from "./compose.js";
import {
  anchorDelta,
  deriveApps,
  extractBlock,
  inferRequires,
  inferWiring,
  isEmptyWiring,
} from "./extract-infer.js";
import { injectAtAnchor } from "./inject.js";
import { runExtract } from "./commands/extract.js";
import { writeProjectManifest } from "./projectmanifest.js";
import { Registry } from "./registry.js";
import { resolveModules } from "./resolve.js";

// track temp dirs for cleanup
const tmps: string[] = [];
function mkTmp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tmps.push(d);
  return d;
}
function write(root: string, rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}
afterEach(() => {
  while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true });
});

describe("extractBlock / anchorDelta", () => {
  const settings = [
    "INSTALLED_APPS = [",
    '    "django.contrib.admin",',
    '    "widgets",',
    "    # <partweave:installed-apps>",
    "]",
  ].join("\n");

  it("collects the contiguous block above an anchor with its indent", () => {
    const block = extractBlock(settings, "installed-apps");
    expect(block?.indent).toBe("    ");
    expect(block?.lines).toEqual([
      "INSTALLED_APPS = [",
      '    "django.contrib.admin",',
      '    "widgets",',
    ]);
  });

  it("returns null when the anchor is absent", () => {
    expect(extractBlock(settings, "nope")).toBeNull();
  });

  it("emits only the lines present in live but not in the reference, indent-stripped", () => {
    const ref = [
      "INSTALLED_APPS = [",
      '    "django.contrib.admin",',
      "    # <partweave:installed-apps>",
      "]",
    ].join("\n");
    const { delta } = anchorDelta(settings, ref, "installed-apps");
    expect(delta).toEqual(['"widgets",']);
  });

  it("round-trips through injectAtAnchor (what we recover re-injects identically)", () => {
    const ref = [
      "INSTALLED_APPS = [",
      '    "django.contrib.admin",',
      "    # <partweave:installed-apps>",
      "]",
    ].join("\n");
    const { delta } = anchorDelta(settings, ref, "installed-apps");
    const { content } = injectAtAnchor(ref, "installed-apps", delta);
    expect(content).toBe(settings);
  });
});

describe("inferWiring (anchor-diff over target dirs)", () => {
  function seedServer(dir: string, opts: { widgets: boolean }): void {
    const installed = [
      "INSTALLED_APPS = [",
      '    "django.contrib.admin",',
      ...(opts.widgets ? ['    "widgets",'] : []),
      "    # <partweave:installed-apps>",
      "]",
      "",
      ...(opts.widgets ? ['WIDGETS_ENABLED = True'] : []),
      "# <partweave:settings>",
    ].join("\n");
    write(dir, "apps/server/config/settings.py", installed);

    const urls = [
      "urlpatterns = [",
      '    path("admin/", admin.site.urls),',
      ...(opts.widgets ? ['    path("api/widgets/", include("widgets.urls")),'] : []),
      "    # <partweave:urls>",
      "]",
    ].join("\n");
    write(dir, "apps/server/config/urls.py", urls);

    const pyproject = [
      "dependencies = [",
      '  "django>=5.0",',
      ...(opts.widgets ? ['  "boto3>=1.35",'] : []),
      "  # <partweave:deps>",
      "]",
    ].join("\n");
    write(dir, "apps/server/pyproject.toml", pyproject);
  }

  it("recovers installedApps, settings, urls and deps from the diff", () => {
    const live = mkTmp("pw-live-");
    const ref = mkTmp("pw-ref-");
    seedServer(live, { widgets: true });
    seedServer(ref, { widgets: false });

    const wiring = inferWiring(live, ref, ["server"]);
    expect(wiring.server).toBeDefined();
    expect(wiring.server?.installedApps).toEqual(['"widgets",']);
    expect(wiring.server?.settings).toEqual(["WIDGETS_ENABLED = True"]);
    expect(wiring.server?.urls).toEqual(['path("api/widgets/", include("widgets.urls")),']);
    expect(wiring.server?.deps).toEqual(["boto3>=1.35"]);
  });

  it("omits a target with no delta (identical anchored files)", () => {
    const live = mkTmp("pw-live-");
    const ref = mkTmp("pw-ref-");
    seedServer(live, { widgets: false });
    seedServer(ref, { widgets: false });
    const wiring = inferWiring(live, ref, ["server"]);
    expect(wiring.server).toBeUndefined();
  });

  it("diffs web package.json dependencies (non-anchor deps)", () => {
    const live = mkTmp("pw-live-");
    const ref = mkTmp("pw-ref-");
    write(live, "apps/web/package.json", JSON.stringify({ dependencies: { next: "15.0.0", "date-fns": "^3.0.0" } }));
    write(ref, "apps/web/package.json", JSON.stringify({ dependencies: { next: "15.0.0" } }));
    const wiring = inferWiring(live, ref, ["web"]);
    expect(wiring.web?.deps).toEqual(["date-fns@^3.0.0"]);
  });
});

describe("isEmptyWiring", () => {
  it("is true for {} and for empty arrays", () => {
    expect(isEmptyWiring({})).toBe(true);
    expect(isEmptyWiring({ settings: [], anchors: { x: [] } })).toBe(true);
    expect(isEmptyWiring({ settings: ["X = 1"] })).toBe(false);
  });
});

describe("inferRequires (import attribution + self-containment)", () => {
  it("attributes a Django import into another module's territory to requires", () => {
    const registry = new Registry();
    // auth owns the `accounts` Django app.
    if (!registry.has("auth")) return; // catalog missing auth — skip
    const root = mkTmp("pw-extract-");
    write(
      root,
      "server/mything/views.py",
      [
        "from django.db import models",
        "from accounts.models import User",
        "from mystery import thing",
        "",
      ].join("\n"),
    );
    const { requires, warnings } = inferRequires(root, registry, ["auth"], "mything");
    expect(requires).toContain("auth");
    // django is a known framework import → no warning; mystery is first-party & unresolved → warning.
    expect(warnings.some((w) => w.includes("mystery"))).toBe(true);
    expect(warnings.some((w) => w.includes("django"))).toBe(false);
    expect(warnings.some((w) => w.includes("accounts"))).toBe(false);
  });

  it("does not require a module for a self import", () => {
    const registry = new Registry();
    const root = mkTmp("pw-extract-");
    write(root, "server/mything/urls.py", "from mything.views import Foo\nfrom . import bar\n");
    const { requires, warnings } = inferRequires(root, registry, [], "mything");
    expect(requires).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

describe("deriveApps", () => {
  it("uses app-kind targets and widens shared to an app", () => {
    expect(deriveApps(["server"], []).sort()).toEqual(["server"]);
    expect(deriveApps(["shared"], []).sort()).toEqual(["web"]);
    expect(deriveApps(["web", "shared"], []).sort()).toEqual(["web"]);
    expect(deriveApps(["server"], ["web"]).sort()).toEqual(["server", "web"]);
  });
});

describe("runExtract (end-to-end)", () => {
  it("emits non-empty wiring and passes round-trip for a hand-added server feature", async () => {
    const registry = new Registry();
    const projDir = mkTmp("pw-proj-");

    // 1. scaffold a server-only project (no feature modules)
    const selection = { projectName: "demo", outDir: projDir, apps: ["server" as const], modules: [] };
    const targets = selectedTargets(buildContext(selection));
    compose({ selection, registry, scaffoldTargets: targets, wireTargets: targets, rootFiles: "all" });
    writeProjectManifest(projDir, { name: "demo", apps: ["server"], modules: [] });

    // 2. hand-add a trivial, self-contained Django feature
    write(projDir, "apps/server/widgets/__init__.py", "");
    write(projDir, "apps/server/widgets/models.py", "from django.db import models\n");
    write(projDir, "apps/server/widgets/urls.py", "from django.urls import path\n\nurlpatterns = []\n");

    // 3. hand-wire it at the settings + urls anchors (as a user would)
    const settingsPath = join(projDir, "apps/server/config/settings.py");
    let s = readFileSync(settingsPath, "utf8");
    s = injectAtAnchor(s, "installed-apps", ['"widgets",']).content;
    s = injectAtAnchor(s, "settings", ["WIDGETS_ENABLED = True"]).content;
    writeFileSync(settingsPath, s);

    const urlsPath = join(projDir, "apps/server/config/urls.py");
    let u = readFileSync(urlsPath, "utf8");
    u = injectAtAnchor(u, "urls", ['path("api/widgets/", include("widgets.urls")),']).content;
    writeFileSync(urlsPath, u);

    // 4. extract — must not throw (round-trip validation passes)
    await runExtract("widgets", { dir: projDir, from: "apps/server/widgets" });

    // 5. the emitted module.json carries the inferred wiring
    const modPath = join(projDir, ".partweave/extracted/widgets/module.json");
    expect(existsSync(modPath)).toBe(true);
    const mod = JSON.parse(readFileSync(modPath, "utf8"));
    expect(mod.id).toBe("widgets");
    expect(mod.targets).toEqual(["server"]);
    expect(mod.wiring.server.installedApps).toContain('"widgets",');
    expect(mod.wiring.server.settings).toContain("WIDGETS_ENABLED = True");
    expect(mod.wiring.server.urls).toContain('path("api/widgets/", include("widgets.urls")),');
    // self-contained feature (only django imports) → no requires
    expect(mod.requires).toEqual([]);
  });
});

describe("resolveModules sanity (guards the round-trip catalog path)", () => {
  it("resolves an empty selection to nothing", () => {
    const registry = new Registry();
    expect(resolveModules(registry, []).modules).toEqual([]);
  });
});
