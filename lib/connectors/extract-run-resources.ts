import type { AgentManifest } from "@/lib/agent/schema";
import { getConnectorAction } from "./registry";
import { isResourcePlaceholder } from "./param-bindings";
import { getResourceType } from "./resource-types";
import { stepKey, walkWithIndex } from "@/lib/agent/step-key";

export interface RunResourceField {
  id: string;
  stepIndex: number;
  paramKey: string;
  resourceType: string;
  connectorId: string;
  label: string;
  dependsOnKey?: string;
}

/**
 * Champs ressource à résoudre côté abonné avant le run.
 *
 * Utilise `walkWithIndex` (lib/agent/step-key.ts) pour partager exactement le
 * même index global que l'orchestrateur, le contrat et le résolveur.
 */
export function extractRunResourceFields(manifest: AgentManifest): RunResourceField[] {
  const fields: RunResourceField[] = [];
  for (const w of walkWithIndex(manifest.steps)) {
    if (w.step.type !== "action" || !w.step.params) continue;
    const action = w.step;
    for (const [key, value] of Object.entries(action.params)) {
      if (!isResourcePlaceholder(value)) continue;
      const resourceType = value.trim().slice("{{resource:".length, -2);
      const def = getResourceType(resourceType);
      const input = getConnectorAction(action.connector, action.action)?.inputs.find(
        (inp) => inp.key === key,
      );
      fields.push({
        id: stepKey(w.stepIndex, key),
        stepIndex: w.stepIndex,
        paramKey: key,
        resourceType,
        connectorId: def?.connectorId ?? action.connector,
        label: input?.label ?? key,
        dependsOnKey: input?.dependsOn,
      });
    }
  }
  return fields;
}

/** Clé d'entrée run pour résoudre un placeholder (unique par étape/param). */
export function resourceInputKey(field: Pick<RunResourceField, "id">): string {
  return field.id;
}
