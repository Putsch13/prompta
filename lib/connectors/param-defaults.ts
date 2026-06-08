import { getConnectorAction } from "./registry";
import { isUnresolvedParamValue } from "./format-action-error";

/** Applique les defaultValue du registre sur params vides ou non résolus. */
export function applyActionParamDefaults(
  connectorId: string,
  actionId: string,
  params: Record<string, string>,
): Record<string, string> {
  const action = getConnectorAction(connectorId, actionId);
  if (!action) return params;

  const out = { ...params };
  for (const input of action.inputs) {
    if (input.defaultValue === undefined) continue;
    const current = out[input.key];
    if (isUnresolvedParamValue(current) || !current?.trim()) {
      out[input.key] = input.defaultValue;
    }
  }
  return out;
}

/** Valeurs initiales recommandées lors de la sélection d'une action. */
export function seedActionParamDefaults(
  connectorId: string,
  actionId: string,
): Record<string, string> {
  const action = getConnectorAction(connectorId, actionId);
  const params: Record<string, string> = {};
  for (const input of action?.inputs ?? []) {
    if (input.defaultValue !== undefined) {
      params[input.key] = input.defaultValue;
    }
  }
  return params;
}

export function inputHasRuntimeDefault(input: {
  defaultValue?: string;
}): boolean {
  return input.defaultValue !== undefined;
}
