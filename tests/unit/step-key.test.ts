import { test } from "node:test";
import assert from "node:assert/strict";

import {
  stepKey,
  parseStepKey,
  isStepKey,
  parallelSubIndex,
  walkWithIndex,
} from "../../lib/agent/step-key";
import { extractRunResourceFields } from "../../lib/connectors/extract-run-resources";
import { buildContract } from "../../lib/agent/contract";
import { resourcePlaceholder } from "../../lib/connectors/param-bindings";
import type { AgentManifest, AgentStep } from "../../lib/agent/schema";

test("stepKey + parseStepKey — aller/retour", () => {
  const k = stepKey(2, "spreadsheetId");
  assert.equal(k, "2:spreadsheetId");
  assert.ok(isStepKey(k));
  const parsed = parseStepKey(k);
  assert.deepEqual(parsed, { stepIndex: 2, paramKey: "spreadsheetId" });
});

test("parallelSubIndex — formule alignée avec l'orchestrateur", () => {
  assert.equal(parallelSubIndex(1, 0, 0), 100);
  assert.equal(parallelSubIndex(1, 0, 1), 101);
  assert.equal(parallelSubIndex(1, 1, 0), 110);
  assert.equal(parallelSubIndex(2, 3, 4), 234);
});

test("walkWithIndex — top-level + parallel branches", () => {
  const steps: AgentStep[] = [
    { type: "llm", model: "gpt-5.4", prompt: "hi", outputKey: "intro" },
    {
      type: "parallel",
      branches: [
        {
          outputKey: "a",
          steps: [{ type: "llm", model: "gpt-5.4", prompt: "x", outputKey: "x" }],
        },
        {
          outputKey: "b",
          steps: [
            { type: "llm", model: "gpt-5.4", prompt: "y1", outputKey: "y1" },
            { type: "llm", model: "gpt-5.4", prompt: "y2", outputKey: "y2" },
          ],
        },
      ],
    },
    {
      type: "action",
      connector: "gmail",
      action: "gmail.send",
      params: { to: "{{dest}}", subject: "S", body: "B", from: resourcePlaceholder("gmail.send_as") },
    },
  ];
  const walked = walkWithIndex(steps);
  const indices = walked.map((w) => w.stepIndex);
  // 0 (llm), 100 (par[0][0]), 110 (par[1][0]), 111 (par[1][1]), 2 (action)
  assert.deepEqual(indices, [0, 100, 110, 111, 2]);
});

test("agent parallèle : clés ressource = clés contrat = mêmes indices", () => {
  const manifest: AgentManifest = {
    kind: "agent",
    executionMode: "semi_autonomous",
    inputs: [],
    secrets: [],
    connectors: ["gmail", "google_sheets"],
    tools: [],
    steps: [
      {
        type: "parallel",
        branches: [
          {
            outputKey: "rows",
            steps: [
              {
                type: "action",
                connector: "google_sheets",
                action: "sheets.read",
                params: { spreadsheetId: resourcePlaceholder("google_sheets.spreadsheet"), range: "A:Z" },
              },
            ],
          },
          {
            outputKey: "sent",
            steps: [
              {
                type: "action",
                connector: "gmail",
                action: "gmail.send",
                params: {
                  from: resourcePlaceholder("gmail.send_as"),
                  to: "{{dest}}",
                  subject: "S",
                  body: "B",
                },
              },
            ],
          },
        ],
      },
    ],
    limits: { max_steps: 10, max_tokens: 4096, timeout_ms: 30000, max_tool_calls: 5, max_output_bytes: 51200 },
    outputs: ["result"],
  };

  const resourceFields = extractRunResourceFields(manifest);
  const resourceIds = new Set(resourceFields.map((r) => r.id));

  const contract = buildContract(manifest.steps);
  const contractResourceKeys = new Set(
    contract.interface
      .filter((i) => i.kind === "resource" || i.kind === "identity")
      .map((i) => i.key),
  );

  // Mêmes clés des deux côtés
  assert.deepEqual(
    Array.from(resourceIds).sort(),
    Array.from(contractResourceKeys).sort(),
  );

  // Indices attendus : parallelSubIndex(0, 0, 0) = 0 + parallelSubIndex(0, 1, 0) = 10
  const expected = [
    `${parallelSubIndex(0, 0, 0)}:spreadsheetId`,
    `${parallelSubIndex(0, 1, 0)}:from`,
  ].sort();
  assert.deepEqual(
    Array.from(resourceIds).sort(),
    expected,
    `clés ressource ne matchent pas la formule unique : ${Array.from(resourceIds).join(",")}`,
  );
});
