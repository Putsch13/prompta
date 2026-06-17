import type { AgentManifest } from "@/lib/agent/schema";
import { extractRunResourceFields } from "@/lib/connectors/extract-run-resources";

export interface RunResourceIssue {
  code: "missing_resource" | "missing_input";
  message: string;
  fieldId: string;
}

/**
 * Bloque un run réel si une variable d'entrée REQUISE (texte libre, non-ressource)
 * n'est pas renseignée. Sans ça, l'agent partait avec des variables vides
 * (ex. requête Drive vide → 400) sans rien demander à l'utilisateur.
 */
export function validateRequiredInputs(
  manifest: AgentManifest,
  inputs: Record<string, string>,
): RunResourceIssue[] {
  const issues: RunResourceIssue[] = [];
  for (const input of manifest.inputs ?? []) {
    if (!input.required) continue;
    // Les ressources (connecteur) sont gérées par validateRunResourcesForExecution.
    if (input.connectorId || input.paramKey) continue;
    const val = inputs[input.key]?.trim();
    if (!val) {
      issues.push({
        code: "missing_input",
        fieldId: input.key,
        message: `Renseignez : ${input.label}`,
      });
    }
  }
  return issues;
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
