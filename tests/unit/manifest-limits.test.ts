import { test } from "node:test";
import assert from "node:assert/strict";

import { computeManifestLimits } from "../../lib/builder/manifest";
import { AgentManifestSchema, type AgentStep } from "../../lib/agent/schema";

function llmStep(i: number): AgentStep {
  return { type: "llm", model: "gpt-5.4", prompt: `étape ${i}` } as AgentStep;
}

function actionStep(i: number): AgentStep {
  return {
    type: "action",
    connector: "slack",
    action: "slack.send",
    params: { channel: "#g", message: `m${i}` },
  } as AgentStep;
}

test("computeManifestLimits — un agent de 12 actions ne plafonne plus à 5 tool calls", () => {
  const steps = Array.from({ length: 12 }, (_, i) => actionStep(i));
  const limits = computeManifestLimits(steps);
  assert.ok(limits.max_tool_calls >= 12, `max_tool_calls=${limits.max_tool_calls}`);
  assert.ok(limits.max_steps >= 12);
});

test("computeManifestLimits — le timeout suit le nombre d'étapes (borné à 5 min)", () => {
  const small = computeManifestLimits([llmStep(0), actionStep(1)]);
  assert.ok(small.timeout_ms >= 120_000, "plancher 2 min");
  const big = computeManifestLimits(Array.from({ length: 30 }, (_, i) => llmStep(i)));
  assert.equal(big.timeout_ms, 300_000, "borne 5 min");
});

test("computeManifestLimits — le budget tokens suit le nombre d'étapes LLM", () => {
  const limits = computeManifestLimits(Array.from({ length: 5 }, (_, i) => llmStep(i)));
  assert.ok(limits.max_tokens >= 5 * 8_000);
});

test("computeManifestLimits — les branches parallèles comptent dans les tool calls", () => {
  const steps: AgentStep[] = [
    {
      type: "parallel",
      branches: [
        { steps: [actionStep(0), actionStep(1)] },
        { steps: [actionStep(2)] },
      ],
    } as AgentStep,
  ];
  const limits = computeManifestLimits(steps);
  assert.ok(limits.max_tool_calls >= 6, `max_tool_calls=${limits.max_tool_calls}`);
});

test("schema — les défauts de limites ne tuent plus un agent moyen", () => {
  const parsed = AgentManifestSchema.parse({ steps: [] });
  assert.ok(parsed.limits.timeout_ms >= 180_000);
  assert.ok(parsed.limits.max_tool_calls >= 10);
  assert.ok(parsed.limits.max_tokens >= 16_000);
  assert.ok(parsed.limits.max_output_bytes >= 512_000);
});
