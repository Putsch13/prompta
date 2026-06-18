/**
 * Résilience du parsing de plan (copilote « ajoute une tâche »).
 * Un nœud ajouté sans tous les champs requis NE doit PAS faire échouer tout le
 * plan (sinon « il pose des questions mais n'ajoute jamais le nœud »).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseGeneratedAgentPlan } from "../../lib/builder/generate-agent-plan";

test("nœud ajouté sans outputKey/name → réparé, plan valide", () => {
  const raw = {
    kind: "agent",
    title: "Test",
    description: "d",
    objective: "o",
    steps: [
      { id: "analyse", type: "llm", name: "Analyse", description: "", outputKey: "analyse_output", model: "gpt-5.4" },
      // nœud "ajouté" incomplet : pas d'outputKey, pas de name
      { id: "envoi", type: "action", connectorId: "gmail", actionSlug: "send_email", next: [] },
    ],
  };
  const plan = parseGeneratedAgentPlan(raw);
  assert.equal(plan.steps.length, 2);
  const envoi = plan.steps.find((s) => s.id === "envoi")!;
  assert.ok(envoi.outputKey, "outputKey doit être dérivé");
  assert.ok(envoi.name, "name doit être dérivé");
});

test("ids manquants/dupliqués → réparés en ids uniques", () => {
  const raw = {
    kind: "agent",
    title: "T",
    description: "d",
    objective: "o",
    steps: [
      { type: "llm", name: "A", description: "", outputKey: "a" },
      { type: "llm", name: "B", description: "", outputKey: "b" },
    ],
  };
  const plan = parseGeneratedAgentPlan(raw);
  const ids = plan.steps.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "ids uniques");
});

test("parallèle : un nœud amont avec next vers 2 nœuds reste valide", () => {
  const raw = {
    kind: "agent",
    title: "T",
    description: "d",
    objective: "o",
    entryStepId: "src",
    steps: [
      { id: "src", type: "llm", name: "Source", description: "", outputKey: "src_out", next: ["a", "b"] },
      { id: "a", type: "action", connectorId: "slack", actionSlug: "send_message", name: "A", description: "", outputKey: "a_out" },
      { id: "b", type: "action", connectorId: "telegram", actionSlug: "send_message", name: "B", description: "", outputKey: "b_out" },
    ],
  };
  const plan = parseGeneratedAgentPlan(raw);
  const src = plan.steps.find((s) => s.id === "src")!;
  assert.deepEqual(src.next, ["a", "b"]);
});
