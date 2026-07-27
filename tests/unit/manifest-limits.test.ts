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

// ── Régression : le chemin conversationnel doit dimensionner ses plafonds ───
// Les défauts Zod sont calibrés pour un plan MOYEN. Une mission tapée dans
// l'extension produisait un manifeste sans `limits` → défauts appliqués quelle
// que soit la taille du plan → « Plafond atteint » à mi-parcours sur un plan
// pourtant valide, puis 2 réparations gâchées sur le même plan (le replan
// conserve ...manifest). buildInstantAgent appelle désormais
// computeManifestLimits ; ce test verrouille l'écart qui le rend nécessaire.

test("les défauts Zod sont INSUFFISANTS pour un gros plan — d'où le calcul explicite", () => {
  const defaults = AgentManifestSchema.parse({ kind: "agent", steps: [llmStep(0)] }).limits;

  // Plan réaliste « grosse mission » : 6 actions + 6 étapes LLM de croisement.
  const big: AgentStep[] = [
    ...Array.from({ length: 6 }, (_, i) => actionStep(i)),
    ...Array.from({ length: 6 }, (_, i) => llmStep(i)),
  ];
  const sized = computeManifestLimits(big);

  assert.ok(
    sized.max_tool_calls > defaults.max_tool_calls,
    `attendu > ${defaults.max_tool_calls}, reçu ${sized.max_tool_calls}`,
  );
  assert.ok(
    sized.max_tokens > defaults.max_tokens,
    `attendu > ${defaults.max_tokens}, reçu ${sized.max_tokens}`,
  );
  assert.ok(sized.max_steps >= big.length);
});

test("un plan avec pilotage navigateur obtient un budget tokens et un timeout élargis", () => {
  const withBrowser: AgentStep[] = [
    { type: "browser", goal: "cliquer sur Afficher le numéro", model: "gpt-5.4" } as AgentStep,
    llmStep(0),
  ];
  const sized = computeManifestLimits(withBrowser);
  const sizedWithout = computeManifestLimits([llmStep(0), llmStep(1)]);
  assert.ok(sized.max_tokens > sizedWithout.max_tokens);
  assert.ok(sized.timeout_ms > sizedWithout.timeout_ms);
});
