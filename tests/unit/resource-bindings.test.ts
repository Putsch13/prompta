import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isResourcePlaceholder,
  resourcePlaceholder,
} from "../../lib/connectors/param-bindings";
import { stripBuilderResources } from "../../lib/builder/validate-manifest-for-publish";
import type { AgentManifest } from "../../lib/agent/schema";

test("détecte les placeholders ressource", () => {
  assert.ok(isResourcePlaceholder("{{resource:google_sheets.spreadsheet}}"));
  assert.ok(!isResourcePlaceholder("abc123"));
});

test("stripBuilderResources remplace builder_test par placeholder end_user", () => {
  const manifest: AgentManifest = {
    kind: "agent",
    inputs: [],
    secrets: [],
    connectors: ["google_sheets"],
    tools: [],
    limits: {
      max_steps: 10,
      max_tokens: 4096,
      timeout_ms: 120000,
      max_tool_calls: 5,
      max_output_bytes: 51200,
    },
    outputs: [],
    steps: [
      {
        type: "action",
        connector: "google_sheets",
        action: "sheets.read",
        params: { spreadsheetId: "real-id-123" },
        paramMeta: {
          spreadsheetId: {
            scope: "builder_test",
            resourceType: "google_sheets.spreadsheet",
          },
        },
      },
    ],
  };
  const stripped = stripBuilderResources(manifest);
  const step = stripped.steps[0];
  assert.equal(step.type, "action");
  if (step.type === "action") {
    assert.equal(
      step.params.spreadsheetId,
      resourcePlaceholder("google_sheets.spreadsheet"),
    );
  }
});
