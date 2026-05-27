import { getConnectorAction } from "./registry";

/** Paramètres obligatoires par action (depuis le registre connecteurs). */
export function getRequiredActionParams(connectorId: string, actionId: string): string[] {
  const action = getConnectorAction(connectorId, actionId);
  if (!action) return [];
  return action.inputs.filter((input) => input.required).map((input) => input.key);
}

export interface ActionParamValidation {
  code: string;
  message: string;
}

export function validateActionParams(
  connectorId: string | undefined,
  actionId: string | undefined,
  params: Record<string, string> | undefined,
  stepLabel: string,
): ActionParamValidation | null {
  if (!params || Object.keys(params).length === 0) {
    return {
      code: "action_no_params",
      message: `${stepLabel} : aucun paramètre mappé.`,
    };
  }

  if (!connectorId?.trim() || !actionId?.trim()) {
    return null;
  }

  const required = getRequiredActionParams(connectorId, actionId);
  for (const key of required) {
    const value = params[key];
    if (value === undefined || value === null || String(value).trim() === "") {
      return {
        code: "action_missing_param",
        message: `${stepLabel} : paramètre obligatoire "${key}" manquant ou vide.`,
      };
    }
  }

  return null;
}
