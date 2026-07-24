import { test } from "node:test";
import assert from "node:assert/strict";

import { computeRunCost } from "../../lib/billing/run-cost";
import { COMPUTE_FLAT_CENTS, getModelPricing, getToolPricing } from "../../lib/llm/pricing";
import type { StepUsage } from "../../lib/agent/orchestrator";

const M = 1_000_000;

test("computeRunCost — run mixte : seuls les steps plateforme sont facturés", () => {
  // L'utilisateur a sa clé OpenAI (BYOK), la plateforme fournit Anthropic.
  const steps: StepUsage[] = [
    { inputTokens: M, outputTokens: M, model: "gpt-5.4", platformBilled: false },
    { inputTokens: M, outputTokens: 0, model: "claude-sonnet-4-6", platformBilled: true },
  ];
  const sonnet = getModelPricing("claude-sonnet-4-6");
  const expected = COMPUTE_FLAT_CENTS + sonnet.inputPer1M;
  assert.equal(computeRunCost({ steps }), Math.ceil(expected * 100) / 100);

  // Contre-vérification : le step BYOK ne doit surtout pas apparaître.
  const gpt = getModelPricing("gpt-5.4");
  assert.ok(
    computeRunCost({ steps }) < COMPUTE_FLAT_CENTS + sonnet.inputPer1M + gpt.inputPer1M,
    "les tokens BYOK ne doivent pas être re-facturés en crédits",
  );
});

test("computeRunCost — run 100 % BYOK : seul le forfait compute reste", () => {
  const steps: StepUsage[] = [
    { inputTokens: M, outputTokens: M, model: "gpt-5.4", platformBilled: false },
    { inputTokens: 0, outputTokens: 0, tool: "web_search", platformBilled: false },
  ];
  assert.equal(computeRunCost({ steps }), COMPUTE_FLAT_CENTS);
});

test("computeRunCost — step sans flag (legacy, run prompt) : facturé comme avant", () => {
  const steps: StepUsage[] = [{ inputTokens: M, outputTokens: 0, model: "gpt-5.4" }];
  const expected = COMPUTE_FLAT_CENTS + getModelPricing("gpt-5.4").inputPer1M;
  assert.equal(computeRunCost({ steps }), Math.ceil(expected * 100) / 100);
});

test("computeRunCost — web_search : clé Serper plateforme facturée, BYOK non", () => {
  const byok: StepUsage[] = [
    { inputTokens: 0, outputTokens: 0, tool: "web_search", platformBilled: false },
  ];
  assert.equal(computeRunCost({ steps: byok }), COMPUTE_FLAT_CENTS);

  const platform: StepUsage[] = [
    { inputTokens: 0, outputTokens: 0, tool: "web_search", platformBilled: true },
  ];
  assert.equal(
    computeRunCost({ steps: platform }),
    COMPUTE_FLAT_CENTS + getToolPricing("web_search"),
  );
});

test("computeRunCost — les actions connecteur (infra plateforme) restent facturées dans un run mixte", () => {
  const steps: StepUsage[] = [
    { inputTokens: M, outputTokens: 0, model: "gpt-5.4", platformBilled: false },
    { inputTokens: 0, outputTokens: 0, connectorAction: "canva.create" },
  ];
  const expected = COMPUTE_FLAT_CENTS + getToolPricing("canva.create");
  assert.equal(computeRunCost({ steps }), Math.ceil(expected * 100) / 100);
});
