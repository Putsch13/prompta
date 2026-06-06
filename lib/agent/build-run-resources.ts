import type { AgentManifest } from "@/lib/agent/schema";
import { extractRunResourceFields } from "@/lib/connectors/extract-run-resources";

export interface RunResourceIssue {
  code: "missing_resource";
  message: string;
  fieldId: string;
}

/** Extrait les ressources des inputs run et normalise les clés « stepIndex:paramKey ». */
export function buildRunResourcesFromInputs(
  manifest: AgentManifest,
  inputs: Record<string, string>,
): { cleanInputs: Record<string, string>; resources: Record<string, string> } {
  const resources: Record<string, string> = {};
  const cleanInputs: Record<string, string> = {};

  for (const field of extractRunResourceFields(manifest)) {
    const val = inputs[field.id]?.trim() || inputs[`${field.stepIndex}:${field.paramKey}`]?.trim();
    if (val) {
      resources[`${field.stepIndex}:${field.paramKey}`] = val;
    }
  }

  for (const [k, v] of Object.entries(inputs)) {
    const trimmed = v?.trim();
    if (!trimmed) continue;
    if (/^\d+:\w+$/.test(k)) {
      resources[k] = trimmed;
    } else {
      cleanInputs[k] = trimmed;
    }
  }

  return { cleanInputs, resources };
}

/** Bloque un run réel si un placeholder ressource n'a pas de valeur. */
export function validateRunResourcesForExecution(
  manifest: AgentManifest,
  inputs: Record<string, string>,
): RunResourceIssue[] {
  const { resources } = buildRunResourcesFromInputs(manifest, inputs);
  const issues: RunResourceIssue[] = [];

  for (const field of extractRunResourceFields(manifest)) {
    const key = `${field.stepIndex}:${field.paramKey}`;
    if (!resources[key]) {
      issues.push({
        code: "missing_resource",
        fieldId: field.id,
        message: `Choisissez : ${field.label} (étape ${field.stepIndex + 1})`,
      });
    }
  }

  return issues;
}
