import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentManifest } from "../../lib/agent/schema";
import {
  buildRunResourcesFromInputs,
  validateRunResourcesForExecution,
} from "../../lib/agent/build-run-resources";
import { extractRunResourceFields } from "../../lib/connectors/extract-run-resources";

const baseManifest = (): AgentManifest => ({
  kind: "agent",
  inputs: [],
  secrets: [],
  connectors: ["google_sheets", "gmail"],
  tools: [],
  limits: {
    max_steps: 10,
    max_tokens: 4096,
    timeout_ms: 120000,
    max_tool_calls: 5,
    max_output_bytes: 51200,
  },
  outputs: [],
  steps: [],
});

test("buildRunResourcesFromInputs mappe id UI vers stepIndex:paramKey", () => {
  const manifest: AgentManifest = {
    ...baseManifest(),
    steps: [
      {
        type: "action",
        connector: "google_sheets",
        action: "sheets.read",
        params: { spreadsheetId: "{{resource:google_sheets.spreadsheet}}" },
      },
    ],
  };

  const { cleanInputs, resources } = buildRunResourcesFromInputs(manifest, {
    "0:spreadsheetId": "sheet-abc",
    customerName: "Alice",
  });

  assert.equal(resources["0:spreadsheetId"], "sheet-abc");
  assert.equal(cleanInputs.customerName, "Alice");
  assert.equal(cleanInputs["0:spreadsheetId"], undefined);
});

test("validateRunResourcesForExecution bloque si ressource manquante", () => {
  const manifest: AgentManifest = {
    ...baseManifest(),
    steps: [
      {
        type: "action",
        connector: "google_sheets",
        action: "sheets.read",
        params: { spreadsheetId: "{{resource:google_sheets.spreadsheet}}" },
      },
    ],
  };

  const issues = validateRunResourcesForExecution(manifest, {});
  assert.equal(issues.length, 1);
  assert.equal(issues[0].fieldId, "0:spreadsheetId");
});

test("index parallèle aligné extract-run-resources / orchestrateur", () => {
  const manifest: AgentManifest = {
    ...baseManifest(),
    steps: [
      {
        type: "parallel",
        branches: [
          {
            steps: [
              {
                type: "action",
                connector: "google_sheets",
                action: "sheets.read",
                params: { spreadsheetId: "{{resource:google_sheets.spreadsheet}}" },
              },
            ],
          },
          {
            steps: [
              {
                type: "action",
                connector: "gmail",
                action: "gmail.send",
                params: { from: "{{resource:gmail.send_as}}", to: "a@b.c", subject: "Hi", body: "x" },
              },
            ],
          },
        ],
      },
    ],
  };

  const fields = extractRunResourceFields(manifest);
  const ids = fields.map((f) => f.id).sort();
  assert.deepEqual(ids, ["0:spreadsheetId", "10:from"]);

  const { resources } = buildRunResourcesFromInputs(manifest, {
    "0:spreadsheetId": "sheet-1",
    "10:from": "me@example.com",
  });
  assert.equal(resources["0:spreadsheetId"], "sheet-1");
  assert.equal(resources["10:from"], "me@example.com");
});
