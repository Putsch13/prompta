/**
 * Remplissage par IA des paramètres en champ libre.
 *
 * Un paramètre `aiFills` est généré au run par un modèle : il ne doit pas être
 * demandé à l'abonné (contrat), doit se propager via le graphe, et rester valide
 * au regard du schéma.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildContract } from "../../lib/agent/contract";
import { graphToSteps, type PlanGraph } from "../../lib/builder/plan-graph";
import { AgentStepSchema, type AgentStep } from "../../lib/agent/schema";
import type { ActionInput } from "../../lib/connectors/types";

const INPUTS: ActionInput[] = [
  { key: "subject", label: "Objet", kind: "input", required: true, type: "text" },
  { key: "body", label: "Corps", kind: "input", required: false, type: "textarea" },
];

test("contrat: param rempli par IA n'est pas demandé à l'abonné", () => {
  const step: AgentStep = {
    type: "action",
    connector: "gmail",
    action: "GMAIL_SEND_EMAIL",
    params: { subject: "{{objet}}", body: "{{corps}}" },
    inputsSchema: INPUTS,
    aiFills: { subject: { model: "gpt-5.4", prompt: "Objet accrocheur pour {{theme}}" } },
  } as AgentStep;

  const c = buildContract([step]);
  // subject est rempli par IA → absent de l'interface
  assert.ok(!c.interface.some((i) => i.key === "objet"));
  // body reste demandé
  assert.ok(c.interface.some((i) => i.key === "corps"));
});

test("schéma: aiFills est accepté sur l'étape action", () => {
  const parsed = AgentStepSchema.safeParse({
    type: "action",
    connector: "gmail",
    action: "GMAIL_SEND_EMAIL",
    params: { subject: "x" },
    aiFills: { subject: { model: "gpt-5.4", prompt: "..." } },
  });
  assert.ok(parsed.success);
});

test("graphToSteps: aiFills se propage du nœud à l'étape", () => {
  const graph: PlanGraph = {
    entryId: "n1",
    nodes: [
      {
        id: "n1",
        kind: "action",
        name: "Envoyer email",
        outputKey: "sent",
        riskLevel: "low",
        requiresApproval: false,
        connectorId: "gmail",
        actionSlug: "GMAIL_SEND_EMAIL",
        params: { subject: "{{objet}}" },
        actionInputs: INPUTS,
        aiFills: { subject: { model: "gpt-5.4", prompt: "Objet pour {{theme}}" } },
      },
    ],
    edges: [],
  };
  const step = graphToSteps(graph)[0] as Extract<AgentStep, { type: "action" }>;
  assert.ok(step.aiFills);
  assert.equal(step.aiFills?.subject.model, "gpt-5.4");
});

test("graphToSteps: nœud sans aiFills → pas de champ parasite", () => {
  const graph: PlanGraph = {
    entryId: "n1",
    nodes: [
      {
        id: "n1",
        kind: "action",
        name: "Envoyer email",
        outputKey: "sent",
        riskLevel: "low",
        requiresApproval: false,
        connectorId: "gmail",
        actionSlug: "GMAIL_SEND_EMAIL",
        params: {},
      },
    ],
    edges: [],
  };
  const step = graphToSteps(graph)[0] as Extract<AgentStep, { type: "action" }>;
  assert.equal(step.aiFills, undefined);
});
