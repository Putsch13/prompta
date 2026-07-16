import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentManifestSchema } from "../../lib/agent/schema";
import { stepDisplayLabel } from "../../lib/agent/step-label";
import { computeManifestLimits } from "../../lib/builder/manifest";
import { estimateMaxCostForManifest } from "../../lib/billing/estimate-manifest-cost";
import { buildContract } from "../../lib/agent/contract";

const browserManifest = AgentManifestSchema.parse({
  kind: "agent",
  steps: [
    { type: "browser", goal: "Remplir le formulaire de contact avec {{coordonnees}}", outputKey: "pilotage" },
    { type: "llm", model: "gpt-5.4-mini", prompt: "Résume : {{pilotage}}", outputKey: "reponse" },
  ],
});

test("schéma : l'étape browser est acceptée avec goal + outputKey", () => {
  const step = browserManifest.steps[0];
  assert.equal(step.type, "browser");
  if (step.type === "browser") assert.ok(step.goal.includes("formulaire"));
});

test("libellé : l'étape browser a un nom lisible (jamais « Étape N »)", () => {
  assert.equal(stepDisplayLabel({ type: "browser" }, 0), "Pilotage du navigateur");
});

test("limites : un manifeste avec pilotage a un timeout de 10 min", () => {
  const limits = computeManifestLimits(browserManifest.steps);
  assert.equal(limits.timeout_ms, 600_000);
  // Le pilotage compte comme appel outil dans le plafond.
  assert.ok((limits.max_tool_calls ?? 0) >= 2);
});

test("coût : l'étape browser est facturée (décisions LLM du pilote)", () => {
  const withBrowser = estimateMaxCostForManifest(browserManifest);
  const withoutBrowser = estimateMaxCostForManifest(
    AgentManifestSchema.parse({ kind: "agent", steps: [browserManifest.steps[1]] }),
  );
  assert.ok(withBrowser > withoutBrowser);
});

test("contrat : les {{variables}} du goal browser deviennent des entrées", () => {
  const contract = buildContract(browserManifest.steps);
  assert.ok(contract.interface.some((i) => i.key === "coordonnees"));
  // La sortie d'étape « pilotage » n'est PAS une entrée demandée.
  assert.ok(!contract.interface.some((i) => i.key === "pilotage"));
});
