/**
 * Calcul déterministe de complétude d'un agent (socle du Copilote guidé).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { computeReadiness } from "../../lib/builder/agent-readiness";
import type { PlanGraph, PlanNode } from "../../lib/builder/plan-graph";

function graphOf(nodes: PlanNode[], edges: PlanGraph["edges"] = []): PlanGraph {
  // chaînage séquentiel par défaut si pas d'arêtes fournies
  const seqEdges =
    edges.length === 0 && nodes.length > 1
      ? nodes.slice(0, -1).map((n, i) => ({
          id: `${n.id}->${nodes[i + 1].id}`,
          source: n.id,
          target: nodes[i + 1].id,
        }))
      : edges;
  return { entryId: nodes[0]?.id ?? "", nodes, edges: seqEdges };
}

function llm(id: string, prompt: string): PlanNode {
  return {
    id,
    kind: "llm",
    name: id,
    model: "gpt-5.4",
    prompt,
    outputKey: `${id}_out`,
    riskLevel: "low",
    requiresApproval: false,
  };
}

test("LLM avec prompt → prêt", () => {
  const r = computeReadiness(graphOf([llm("a", "Rédige un résumé")]));
  assert.equal(r.ready, true);
  assert.equal(r.percent, 100);
});

test("LLM sans prompt → incomplet", () => {
  const r = computeReadiness(graphOf([llm("a", "")]));
  assert.equal(r.ready, false);
  assert.equal(r.nodes[0].status, "incomplete");
  assert.ok(r.nodes[0].missing.some((m) => m.kind === "prompt"));
});

test("action sans connecteur → erreur + non prêt", () => {
  const node: PlanNode = {
    id: "send",
    kind: "action",
    name: "Envoyer",
    outputKey: "sent",
    riskLevel: "low",
    requiresApproval: false,
    connectorId: "",
    actionSlug: "",
  };
  const r = computeReadiness(graphOf([node]));
  assert.equal(r.ready, false);
  assert.equal(r.nodes[0].status, "error");
});

test("action native requise non remplie → incomplet (paramètre manquant)", () => {
  const node: PlanNode = {
    id: "send",
    kind: "action",
    name: "Envoyer email",
    outputKey: "sent",
    riskLevel: "low",
    requiresApproval: false,
    connectorId: "gmail",
    actionSlug: "gmail.send",
    params: {},
  };
  const r = computeReadiness(graphOf([node]));
  const nr = r.nodes[0];
  assert.equal(nr.status, "incomplete");
  assert.ok(nr.missing.length > 0);
});

test("action avec paramètres requis liés → prête", () => {
  const node: PlanNode = {
    id: "send",
    kind: "action",
    name: "Envoyer email",
    outputKey: "sent",
    riskLevel: "low",
    requiresApproval: false,
    connectorId: "gmail",
    actionSlug: "gmail.send",
    params: {
      from: "{{resource:gmail.send_as}}",
      to: "{{destinataire}}",
      subject: "{{sujet}}",
      body: "{{corps}}",
    },
  };
  const r = computeReadiness(graphOf([node]));
  assert.equal(r.nodes[0].status, "ok");
});

test("aiFills satisfait un paramètre requis", () => {
  const node: PlanNode = {
    id: "send",
    kind: "action",
    name: "Envoyer email",
    outputKey: "sent",
    riskLevel: "low",
    requiresApproval: false,
    connectorId: "gmail",
    actionSlug: "gmail.send",
    params: { to: "{{destinataire}}" },
    aiFills: { subject: { model: "gpt-5.4", prompt: "objet" }, body: { model: "gpt-5.4", prompt: "corps" } },
  };
  const r = computeReadiness(graphOf([node]));
  const nr = r.nodes[0];
  // subject/body couverts par IA → ne sont plus « missing »
  assert.ok(!nr.missing.some((m) => m.key === "subject"));
  assert.ok(!nr.missing.some((m) => m.key === "body"));
});

test("firstIncompleteId pointe sur la 1re étape non prête", () => {
  const r = computeReadiness(graphOf([llm("a", "ok"), llm("b", "")]));
  assert.equal(r.firstIncompleteId, "b");
});
