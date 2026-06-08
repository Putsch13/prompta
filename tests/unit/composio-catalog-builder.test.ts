/**
 * Câblage catalogue Composio → builder/contrat.
 *
 * Vérifie qu'un agent peut utiliser n'importe quel outil Composio (hors registre
 * natif) via le snapshot `inputsSchema` : le contrat le dérive correctement, le
 * graphe le propage, et le helper d'inputs choisit la bonne source.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildContract } from "../../lib/agent/contract";
import { actionInputsForStep, actionInputsFor } from "../../lib/connectors/action-inputs";
import { graphToSteps, type PlanGraph } from "../../lib/builder/plan-graph";
import { resourcePlaceholder } from "../../lib/connectors/param-bindings";
import { stepKey } from "../../lib/agent/step-key";
import type { AgentStep } from "../../lib/agent/schema";
import type { ActionInput } from "../../lib/connectors/types";

const NOTION_INPUTS: ActionInput[] = [
  { key: "title", label: "Title", kind: "input", required: true, type: "text" },
  {
    key: "parent_id",
    label: "Parent page",
    kind: "resource",
    resourceType: "notion.page",
    required: true,
  },
  { key: "content", label: "Content", kind: "input", required: false, type: "textarea" },
];

function notionStep(): AgentStep {
  return {
    type: "action",
    connector: "notion",
    action: "NOTION_CREATE_PAGE",
    params: {
      title: "{{titre}}",
      parent_id: resourcePlaceholder("notion.page"),
      content: "{{corps}}",
    },
    inputsSchema: NOTION_INPUTS,
  } as AgentStep;
}

// ─── Helper actionInputsForStep ───────────────────────────────────────────────

test("actionInputsFor: connecteur natif renvoie les inputs du registre", () => {
  const inputs = actionInputsFor("gmail", "gmail.send");
  assert.ok(inputs && inputs.length > 0);
  assert.ok(inputs!.some((i) => i.key === "to"));
});

test("actionInputsFor: action inconnue → undefined", () => {
  assert.equal(actionInputsFor("notion", "NOTION_CREATE_PAGE"), undefined);
});

test("actionInputsForStep: tool Composio arbitraire → snapshot inputsSchema", () => {
  const inputs = actionInputsForStep({
    connector: "notion",
    action: "NOTION_CREATE_PAGE",
    inputsSchema: NOTION_INPUTS,
  });
  assert.equal(inputs.length, 3);
  assert.ok(inputs.some((i) => i.key === "parent_id" && i.kind === "resource"));
});

test("actionInputsForStep: registre natif prioritaire sur le snapshot", () => {
  const inputs = actionInputsForStep({
    connector: "gmail",
    action: "gmail.send",
    inputsSchema: NOTION_INPUTS, // doit être ignoré
  });
  assert.ok(inputs.some((i) => i.key === "to"));
  assert.ok(!inputs.some((i) => i.key === "parent_id"));
});

test("actionInputsForStep: étape sans schéma ni registre → []", () => {
  assert.deepEqual(
    actionInputsForStep({ connector: "notion", action: "NOTION_CREATE_PAGE" }),
    [],
  );
});

// ─── Contrat sur un tool Composio arbitraire ──────────────────────────────────

test("contrat: tool Composio arbitraire dérive champ abonné + ressource", () => {
  const c = buildContract([notionStep()]);
  assert.ok(c.interface.some((i) => i.key === "titre" && i.source === "subscriber"));
  const resource = c.interface.find((i) => i.key === stepKey(0, "parent_id"));
  assert.ok(resource);
  assert.equal(resource?.kind, "resource");
  assert.equal(resource?.resourceType, "notion.page");
});

test("contrat: param optionnel (content) lié à variable → champ abonné", () => {
  const c = buildContract([notionStep()]);
  assert.ok(c.interface.some((i) => i.key === "corps"));
});

test("contrat: pipeline LLM → tool Composio (sortie d'étape non demandée)", () => {
  const steps: AgentStep[] = [
    { type: "llm", model: "gpt-5.4", prompt: "Rédige {{sujet}}", outputKey: "corps" } as AgentStep,
    {
      type: "action",
      connector: "notion",
      action: "NOTION_CREATE_PAGE",
      params: { title: "{{titre}}", parent_id: resourcePlaceholder("notion.page"), content: "{{corps}}" },
      inputsSchema: NOTION_INPUTS,
    } as AgentStep,
  ];
  const c = buildContract(steps);
  assert.ok(c.interface.some((i) => i.key === "sujet"));
  assert.ok(c.interface.some((i) => i.key === "titre"));
  // corps est une sortie d'étape → pas demandé
  assert.ok(!c.interface.some((i) => i.key === "corps"));
});

// ─── Propagation via le graphe ────────────────────────────────────────────────

test("graphToSteps: nœud action Composio propage inputsSchema dans l'étape", () => {
  const graph: PlanGraph = {
    entryId: "n1",
    nodes: [
      {
        id: "n1",
        kind: "action",
        name: "Créer page Notion",
        outputKey: "page",
        riskLevel: "low",
        requiresApproval: false,
        connectorId: "notion",
        actionSlug: "NOTION_CREATE_PAGE",
        params: { title: "{{titre}}" },
        actionInputs: NOTION_INPUTS,
      },
    ],
    edges: [],
  };
  const steps = graphToSteps(graph);
  assert.equal(steps.length, 1);
  const step = steps[0] as Extract<AgentStep, { type: "action" }>;
  assert.equal(step.type, "action");
  assert.equal(step.connector, "notion");
  assert.ok(step.inputsSchema && step.inputsSchema.length === 3);
});

test("graphToSteps: nœud action natif sans snapshot → pas d'inputsSchema parasite", () => {
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
        actionSlug: "gmail.send",
        params: {},
      },
    ],
    edges: [],
  };
  const step = graphToSteps(graph)[0] as Extract<AgentStep, { type: "action" }>;
  assert.equal(step.inputsSchema, undefined);
});
