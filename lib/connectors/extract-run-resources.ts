import type { AgentManifest, AgentStep } from "@/lib/agent/schema";
import { getConnectorAction } from "./registry";
import { isResourcePlaceholder } from "./param-bindings";
import { getResourceType } from "./resource-types";

export interface RunResourceField {
  id: string;
  stepIndex: number;
  paramKey: string;
  resourceType: string;
  connectorId: string;
  label: string;
  dependsOnKey?: string;
}

function walkSteps(steps: AgentStep[], fields: RunResourceField[], offset = 0): void {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const idx = offset + i;

    if (step.type === "parallel") {
      for (const branch of step.branches) {
        walkSteps(branch.steps as AgentStep[], fields, idx);
      }
      continue;
    }

    if (step.type !== "action" || !step.params) continue;

    for (const [key, value] of Object.entries(step.params)) {
      if (!isResourcePlaceholder(value)) continue;
      const resourceType = value.trim().slice("{{resource:".length, -2);
      const def = getResourceType(resourceType);
      const input = getConnectorAction(step.connector, step.action)?.inputs.find(
        (inp) => inp.key === key,
      );
      fields.push({
        id: `${idx}:${key}`,
        stepIndex: idx,
        paramKey: key,
        resourceType,
        connectorId: def?.connectorId ?? step.connector,
        label: input?.label ?? key,
        dependsOnKey: input?.dependsOn,
      });
    }
  }
}

/** Champs ressource à résoudre côté abonné avant le run. */
export function extractRunResourceFields(manifest: AgentManifest): RunResourceField[] {
  const fields: RunResourceField[] = [];
  walkSteps(manifest.steps, fields);
  return fields;
}

/** Clé d'entrée run pour résoudre un placeholder (unique par étape/param). */
export function resourceInputKey(field: Pick<RunResourceField, "id">): string {
  return field.id;
}
