import {
  isParamBinding,
  isResourcePlaceholder,
} from "@/lib/connectors/param-bindings";
import { getConnectorAction } from "@/lib/connectors/registry";
import { graphToSteps, graphRunInputs, type PlanGraph } from "@/lib/builder/plan-graph";
import type { AgentStep } from "@/lib/agent/schema";

export interface ClientRequirementItem {
  id: string;
  label: string;
  nodeName?: string;
  detail?: string;
}

export interface ClientRequirementsSummary {
  clientConnectors: ClientRequirementItem[];
  clientResources: ClientRequirementItem[];
  clientVariables: ClientRequirementItem[];
  clientSecrets: ClientRequirementItem[];
  sharedProvided: ClientRequirementItem[];
}

function walkSteps(
  steps: AgentStep[],
  graph: PlanGraph,
  out: ClientRequirementsSummary,
): void {
  for (const step of steps) {
    if (step.type === "parallel") {
      for (const branch of step.branches) {
        walkSteps(branch.steps as AgentStep[], graph, out);
      }
      continue;
    }

    if (step.type === "llm") {
      const matches = step.prompt.match(/\{\{([\w.]+)\}\}/g) ?? [];
      for (const m of matches) {
        const key = m.slice(2, -2);
        if (key.includes("_output") || key.startsWith("resource:")) continue;
        if (out.clientVariables.some((v) => v.id === key)) continue;
        out.clientVariables.push({ id: key, label: key });
      }
    }

    if (step.type !== "action") continue;

    const node = graph.nodes.find(
      (n) => n.connectorId === step.connector && n.actionSlug === step.action,
    );
    const nodeName = node?.name ?? step.connector;

    if (step.sharedEnv) {
      out.sharedProvided.push({
        id: `${step.connector}:${step.action}`,
        label: `${step.connector} · ${step.action}`,
        nodeName,
        detail: "Env partagée — vos accès seront utilisés par tous les abonnés",
      });
      continue;
    }

    out.clientConnectors.push({
      id: step.connector,
      label: step.connector,
      nodeName,
    });

    const actionDef = getConnectorAction(step.connector, step.action);
    for (const [key, value] of Object.entries(step.params ?? {})) {
      if (isResourcePlaceholder(value)) {
        const input = actionDef?.inputs.find((i) => i.key === key);
        const rt = value.trim().slice("{{resource:".length, -2);
        out.clientResources.push({
          id: `${step.connector}:${rt}:${key}`,
          label: input?.label ?? rt,
          nodeName,
        });
      } else if (isParamBinding(value)) {
        const inner = value.trim().slice(2, -2);
        if (!inner.includes("_output") && !inner.startsWith("resource:")) {
          if (!out.clientVariables.some((v) => v.id === inner)) {
            out.clientVariables.push({ id: inner, label: inner, nodeName });
          }
        }
      }
    }
  }
}

export function deriveClientRequirements(
  graph: PlanGraph | null,
  defaultModel: string,
): ClientRequirementsSummary {
  const out: ClientRequirementsSummary = {
    clientConnectors: [],
    clientResources: [],
    clientVariables: [],
    clientSecrets: [],
    sharedProvided: [],
  };

  if (!graph) return out;

  const steps = graphToSteps(graph, defaultModel);
  walkSteps(steps, graph, out);

  // Variables texte dérivées des steps (alignées sur manifest.inputs)
  for (const field of graphRunInputs(graph, defaultModel)) {
    if (!out.clientVariables.some((v) => v.id === field.key)) {
      out.clientVariables.push({ id: field.key, label: field.label || field.key });
    }
  }

  const seenConn = new Set<string>();
  out.clientConnectors = out.clientConnectors.filter((c) => {
    if (seenConn.has(c.id)) return false;
    seenConn.add(c.id);
    return true;
  });

  return out;
}
