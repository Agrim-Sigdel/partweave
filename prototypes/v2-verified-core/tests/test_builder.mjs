import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkPermission } from "../cores/rbac_core.mjs";
import {
  canTransition,
  decideTransition,
  validateWorkflow,
} from "../cores/workflow_core.mjs";
import { buildVerifiedModule } from "../templates/build_module.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROTO_ROOT = resolve(__dirname, "..");

const ORDER_WORKFLOW = {
  states: ["draft", "submitted", "approved", "rejected", "cancelled"],
  initial: "draft",
  transitions: {
    draft: { submit: "submitted", cancel: "cancelled" },
    submitted: { approve: "approved", reject: "rejected", cancel: "cancelled" },
  },
};

test("workflow_core.mjs enforces valid transitions and rejects illegal ones", () => {
  validateWorkflow(ORDER_WORKFLOW);
  assert.equal(canTransition(ORDER_WORKFLOW, "draft", "submit"), true);
  assert.equal(canTransition(ORDER_WORKFLOW, "draft", "approve"), false);

  assert.deepEqual(decideTransition(ORDER_WORKFLOW, "draft", "submit"), {
    ok: true,
    value: "submitted",
    error: null,
  });

  const denied = decideTransition(ORDER_WORKFLOW, "draft", "approve");
  assert.equal(denied.ok, false);
  assert.match(denied.error, /No transition 'approve' from state 'draft'/);

  assert.throws(
    () =>
      validateWorkflow({
        states: ["draft"],
        initial: "draft",
        transitions: { draft: { go: "missing" } },
      }),
    /unknown state/,
  );
});

test("rbac_core.mjs enforces 401 / 403 / 200 invariants", () => {
  assert.equal(checkPermission({ authenticated: false }, "orders.approve").statusCode, 401);
  assert.equal(
    checkPermission(
      { authenticated: true, isSuperuser: false, permissions: ["orders.view"] },
      "orders.approve",
    ).statusCode,
    403,
  );
  assert.equal(
    checkPermission(
      { authenticated: true, isSuperuser: false, permissions: ["orders.approve"] },
      "orders.approve",
    ).statusCode,
    200,
  );
  assert.equal(
    checkPermission(
      { authenticated: true, isSuperuser: true, permissions: [] },
      "anything",
    ).statusCode,
    200,
  );
});

test("buildVerifiedModule assembles coherent partweave modules from core + shell", () => {
  const outRoot = mkdtempSync(join(tmpdir(), "partweave-v2-proto-"));
  try {
    const workflowMod = buildVerifiedModule(
      {
        id: "workflow-engine",
        title: "Workflow / State Machine Engine",
        description: "Verified transition core wrapped by a common atomic Django shell.",
        targets: ["server", "shared"],
        requiresApps: ["server"],
        wiring: {
          server: {
            installedApps: ["\"core.workflow_engine\","],
          },
        },
        files: [
          {
            src: join(PROTO_ROOT, "cores/workflow_core.py"),
            dest: "server/core/workflow_engine/core.py",
          },
          {
            src: join(PROTO_ROOT, "templates/runtime_wrapper.py"),
            dest: "server/core/workflow_engine/wrapper.py",
          },
          {
            src: join(PROTO_ROOT, "cores/workflow_core.mjs"),
            dest: "shared/src/workflow_core.mjs",
          },
        ],
        generatedFiles: [
          {
            dest: "server/core/workflow_engine/apps.py",
            content:
              'from django.apps import AppConfig\n\nclass WorkflowEngineConfig(AppConfig):\n    name = "core.workflow_engine"\n',
          },
        ],
      },
      outRoot,
    );

    assert.equal(existsSync(join(workflowMod.moduleDir, "module.json")), true);
    assert.equal(
      existsSync(join(workflowMod.moduleDir, "server/core/workflow_engine/core.py")),
      true,
    );
    assert.equal(
      existsSync(join(workflowMod.moduleDir, "server/core/workflow_engine/wrapper.py")),
      true,
    );
    assert.equal(
      existsSync(join(workflowMod.moduleDir, "shared/src/workflow_core.mjs")),
      true,
    );

    const parsed = JSON.parse(
      readFileSync(join(workflowMod.moduleDir, "module.json"), "utf8"),
    );
    assert.deepEqual(parsed.targets, ["server", "shared"]);
    for (const wiredTarget of Object.keys(parsed.wiring)) {
      assert.ok(parsed.targets.includes(wiredTarget));
    }
    for (const target of parsed.targets) {
      assert.ok(existsSync(join(workflowMod.moduleDir, target)));
    }
  } finally {
    rmSync(outRoot, { recursive: true, force: true });
  }
});
