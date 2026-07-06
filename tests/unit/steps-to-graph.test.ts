import { test } from "node:test";
import assert from "node:assert/strict";
import { stepsToGraph, graphToSteps } from "@/lib/builder/plan-graph";
import type { AgentStep } from "@/lib/agent/schema";

test("stepsToGraph : chaîne linéaire → graphe éditable, round-trip stable", () => {
  const steps: AgentStep[] = [
    { type: "tool", tool: "web_search", params: { query: "actus IA" }, outputKey: "recherche" },
    { type: "llm", model: "gpt-5.4", prompt: "Résume {{recherche}}", outputKey: "resume" },
    {
      type: "action",
      connector: "gmail",
      action: "gmail.send",
      params: { to: "moi@example.com", body: "{{resume}}" },
      aiFills: { subject: { model: "gpt-5.4-mini", prompt: "Objet accrocheur" } },
      outputKey: "envoi",
    },
  ];

  const graph = stepsToGraph(steps, { title: "Veille" });
  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.edges.length, 2);
  assert.equal(graph.entryId, graph.nodes[0].id);
  assert.equal(graph.meta?.title, "Veille");

  // Tout est préservé sur le nœud action.
  const action = graph.nodes.find((n) => n.kind === "action")!;
  assert.equal(action.actionSlug, "gmail.send");
  assert.equal(action.params?.to, "moi@example.com");
  assert.ok(action.aiFills?.subject);

  // Round-trip : recompiler le graphe redonne des steps équivalents.
  const back = graphToSteps(graph, "gpt-5.4");
  assert.equal(back.length, 3);
  assert.equal(back[0].type, "tool");
  assert.equal(back[1].type, "llm");
  assert.equal(back[2].type, "action");
  assert.equal((back[2] as { outputKey?: string }).outputKey, "envoi");
});

test("stepsToGraph : étape parallèle dépliée en branches", () => {
  const steps: AgentStep[] = [
    { type: "llm", model: "gpt-5.4", prompt: "Prépare le plan", outputKey: "plan" },
    {
      type: "parallel",
      branches: [
        {
          steps: [
            { type: "tool", tool: "web_search", params: {}, outputKey: "b1" },
            { type: "llm", model: "gpt-5.4", prompt: "Analyse {{b1}}", outputKey: "a1" },
          ],
        },
        {
          steps: [{ type: "tool", tool: "web_search", params: {}, outputKey: "b2" }],
        },
      ],
      outputKey: "par",
    },
  ];

  const graph = stepsToGraph(steps);
  // 1 nœud amont + 3 nœuds de branches.
  assert.equal(graph.nodes.length, 4);
  // Le nœud amont a deux sorties (une par branche).
  const outs = graph.edges.filter((e) => e.source === graph.entryId);
  assert.equal(outs.length, 2);

  // Recompilé : redevient un parallel à 2 branches.
  const back = graphToSteps(graph, "gpt-5.4");
  const par = back.find((s) => s.type === "parallel");
  assert.ok(par);
  assert.equal((par as { branches: unknown[] }).branches.length, 2);
});
