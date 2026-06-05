import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planToGraph,
  graphToPlan,
  graphToSteps,
  layoutGraph,
  type PlanGraph,
} from "../../lib/builder/plan-graph";
import type { GeneratedAgentPlan } from "../../lib/builder/generate-agent-plan";
import { AgentStepSchema } from "../../lib/agent/schema";

const branchedPlan: GeneratedAgentPlan = {
  kind: "workflow",
  title: "Publication multi-réseaux",
  description: "Test",
  objective: "Publier en parallèle",
  variables: [],
  requiredConnectors: [
    { connectorId: "linkedin", reason: "post", requiredActions: ["create_post"] },
    { connectorId: "twitter", reason: "tweet", requiredActions: ["create_tweet"] },
    { connectorId: "facebook", reason: "post", requiredActions: ["create_post"] },
    { connectorId: "instagram", reason: "post", requiredActions: ["create_post"] },
  ],
  entryStepId: "generate",
  steps: [
    {
      id: "generate",
      type: "llm",
      name: "Générer post",
      description: "Rédige le contenu",
      outputKey: "post_content",
      riskLevel: "low",
      requiresApproval: false,
      next: ["post_linkedin", "post_twitter", "post_facebook", "post_instagram"],
    },
    {
      id: "post_linkedin",
      type: "action",
      name: "LinkedIn",
      description: "Publier",
      outputKey: "linkedin",
      connectorId: "linkedin",
      actionSlug: "create_post",
      branchLabel: "LinkedIn",
      riskLevel: "high",
      requiresApproval: true,
    },
    {
      id: "post_twitter",
      type: "action",
      name: "X",
      description: "Publier",
      outputKey: "twitter",
      connectorId: "twitter",
      actionSlug: "create_tweet",
      branchLabel: "X",
      riskLevel: "high",
      requiresApproval: true,
    },
    {
      id: "post_facebook",
      type: "action",
      name: "Facebook",
      description: "Publier",
      outputKey: "facebook",
      connectorId: "facebook",
      actionSlug: "create_post",
      branchLabel: "Facebook",
      riskLevel: "high",
      requiresApproval: true,
    },
    {
      id: "post_instagram",
      type: "action",
      name: "Instagram",
      description: "Publier",
      outputKey: "instagram",
      connectorId: "instagram",
      actionSlug: "create_post",
      branchLabel: "Instagram",
      riskLevel: "high",
      requiresApproval: true,
    },
  ],
  triggers: [{ type: "manual" }],
  policies: {
    maxIterations: 1,
    requireHumanApprovalForExternalActions: true,
    memoryEnabled: false,
  },
};

test("planToGraph → graphToPlan round-trip idempotent", () => {
  const graph = layoutGraph(planToGraph(branchedPlan));
  const round = graphToPlan(graph);
  const graph2 = planToGraph(round);
  assert.equal(graph2.entryId, branchedPlan.entryStepId);
  assert.equal(graph2.nodes.length, branchedPlan.steps.length);
  assert.equal(graph2.edges.length, 4);
  const generateOut = graph2.edges.filter((e) => e.source === "generate");
  assert.equal(generateOut.length, 4);
});

test("router 1→4 compile en ParallelStep à 4 branches", () => {
  const graph = layoutGraph(planToGraph(branchedPlan));
  const steps = graphToSteps(graph, "gpt-5.4");
  const parallel = steps.find((s) => s.type === "parallel");
  assert.ok(parallel && parallel.type === "parallel");
  assert.equal(parallel.branches.length, 4);
  for (const branch of parallel.branches) {
    assert.equal(branch.steps.length, 1);
    const parsed = AgentStepSchema.safeParse(branch.steps[0]);
    assert.ok(parsed.success);
    assert.equal(parsed.data.type, "action");
  }
});

test("layoutGraph positionne les nœuds", () => {
  const graph = layoutGraph(planToGraph(branchedPlan));
  const generate = graph.nodes.find((n) => n.id === "generate");
  assert.ok(generate?.x !== undefined && generate.y !== undefined);
  const linkedin = graph.nodes.find((n) => n.id === "post_linkedin");
  assert.ok(linkedin && linkedin.x! > generate!.x!);
});

test("plan linéaire sans next reste séquentiel", () => {
  const linear: GeneratedAgentPlan = {
    ...branchedPlan,
    entryStepId: undefined,
    steps: [
      {
        id: "a",
        type: "llm",
        name: "A",
        description: "step a",
        outputKey: "a",
        riskLevel: "low",
        requiresApproval: false,
      },
      {
        id: "b",
        type: "llm",
        name: "B",
        description: "step b",
        outputKey: "b",
        riskLevel: "low",
        requiresApproval: false,
      },
    ],
  };
  const graph = planToGraph(linear);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0].source, "a");
  assert.equal(graph.edges[0].target, "b");
});
