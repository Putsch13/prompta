/**
 * Complétude d'un agent — calcul **déterministe** (sans IA) de ce qui est prêt
 * et de ce qui manque, nœud par nœud. Sert de socle au Copilote guidé : on ne
 * s'appuie pas sur le JSON d'un LLM pour décider si l'agent peut tourner.
 */

import { actionInputsForStep } from "@/lib/connectors/action-inputs";
import { inputHasRuntimeDefault } from "@/lib/connectors/param-defaults";
import { validatePlanGraph, type PlanGraph, type PlanNode, type PlanNodeKind } from "./plan-graph";

export type MissingKind = "input" | "resource" | "connection" | "prompt" | "expression";

export interface MissingItem {
  key: string;
  label: string;
  kind: MissingKind;
  resourceType?: string;
  connector?: string;
}

export interface NodeReadiness {
  nodeId: string;
  name: string;
  kind: PlanNodeKind;
  status: "ok" | "incomplete" | "error";
  missing: MissingItem[];
}

export interface AgentReadiness {
  ready: boolean;
  total: number;
  okCount: number;
  /** 0–100 */
  percent: number;
  nodes: NodeReadiness[];
  blockingIssues: string[];
  /** Premier nœud non terminé (à mettre en avant dans le copilote). */
  firstIncompleteId?: string;
}

/** Un paramètre requis est-il configuré (peu importe la source) ? */
function paramConfigured(node: PlanNode, input: { key: string; defaultValue?: string }): boolean {
  if (node.aiFills?.[input.key]) return true;
  if (inputHasRuntimeDefault(input)) return true;
  const v = node.params?.[input.key];
  return !!v && v.trim().length > 0;
}

function readinessForNode(node: PlanNode): NodeReadiness {
  const base = { nodeId: node.id, name: node.name, kind: node.kind };

  if (node.kind === "action") {
    if (!node.connectorId || !node.actionSlug) {
      return {
        ...base,
        status: "error",
        missing: [
          {
            key: "__action__",
            label: "Connecteur et action à choisir",
            kind: "connection",
          },
        ],
      };
    }
    const inputs = actionInputsForStep({
      connector: node.connectorId,
      action: node.actionSlug,
      inputsSchema: node.actionInputs,
    });
    const missing: MissingItem[] = [];
    for (const input of inputs) {
      if (!input.required) continue;
      if (paramConfigured(node, input)) continue;
      const isResource = input.kind === "resource" || input.kind === "identity" || !!input.resourceType;
      missing.push({
        key: input.key,
        label: input.label,
        kind: isResource ? "resource" : "input",
        resourceType: input.resourceType,
        connector: node.connectorId,
      });
    }
    return { ...base, status: missing.length > 0 ? "incomplete" : "ok", missing };
  }

  if (node.kind === "llm") {
    const ok = !!(node.prompt ?? node.description)?.trim();
    return {
      ...base,
      status: ok ? "ok" : "incomplete",
      missing: ok ? [] : [{ key: "prompt", label: "Consigne du modèle", kind: "prompt" }],
    };
  }

  if (node.kind === "condition") {
    const ok = !!(node.expression ?? node.description)?.trim();
    return {
      ...base,
      status: ok ? "ok" : "incomplete",
      missing: ok ? [] : [{ key: "expression", label: "Expression de condition", kind: "expression" }],
    };
  }

  if (node.kind === "code") {
    const ok = !!(node.prompt ?? node.description)?.trim();
    return {
      ...base,
      status: ok ? "ok" : "incomplete",
      missing: ok ? [] : [{ key: "prompt", label: "Code à exécuter", kind: "prompt" }],
    };
  }

  if (node.kind === "retrieve") {
    const ok = !!(node.query ?? node.description)?.trim() && !!node.dataSource;
    return {
      ...base,
      status: ok ? "ok" : "incomplete",
      missing: ok ? [] : [{ key: "query", label: "Source et requête à préciser", kind: "input" }],
    };
  }

  // tool / approval / trigger : pas de config requise bloquante
  return { ...base, status: "ok", missing: [] };
}

export function computeReadiness(graph: PlanGraph, defaultModel = "gpt-5.4"): AgentReadiness {
  const nodes = graph.nodes.map(readinessForNode);
  const okCount = nodes.filter((n) => n.status === "ok").length;
  const total = nodes.length;

  const issues = validatePlanGraph(graph, defaultModel);
  const blockingIssues = issues.filter((i) => i.level === "error").map((i) => i.message);

  const firstIncomplete = nodes.find((n) => n.status !== "ok");
  const ready = total > 0 && okCount === total && blockingIssues.length === 0;
  const percent = total === 0 ? 0 : Math.round((okCount / total) * 100);

  return {
    ready,
    total,
    okCount,
    percent,
    nodes,
    blockingIssues,
    firstIncompleteId: firstIncomplete?.nodeId,
  };
}
