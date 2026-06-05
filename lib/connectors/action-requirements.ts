import { getConnectorAction } from "./registry";

const BINDING_RE = /^\s*\{\{[\w.]+\}\}\s*$/;

/** True si la valeur est un binding {{variable}} ou {{sortie_etape}}. */
export function isBinding(v?: string): boolean {
  if (v === undefined || v === null) return false;
  if (BINDING_RE.test(String(v))) return true;
  return /^\s*\{\{resource:[\w.]+\}\}\s*$/.test(String(v));
}

/** Paramètres obligatoires par action (depuis le registre connecteurs). */
export function getRequiredActionParams(connectorId: string, actionId: string): string[] {
  const action = getConnectorAction(connectorId, actionId);
  if (!action) return [];
  return action.inputs.filter((input) => input.required).map((input) => input.key);
}

export interface ActionParamIssue {
  key: string;
  severity: "warning" | "error";
  code: string;
  message: string;
}

/**
 * Valide les bindings de paramètres d'une action.
 * Les params vides ou non mappés → warning (fournis au run), jamais error.
 */
export function validateActionParams(
  connectorId: string | undefined,
  actionId: string | undefined,
  params: Record<string, string> | undefined,
  stepLabel: string,
): ActionParamIssue[] {
  const issues: ActionParamIssue[] = [];

  if (!connectorId?.trim() || !actionId?.trim()) {
    return issues;
  }

  const action = getConnectorAction(connectorId, actionId);
  const required = getRequiredActionParams(connectorId, actionId);

  for (const key of required) {
    const value = params?.[key];
    if (isBinding(value)) continue;

    const label = action?.inputs.find((i) => i.key === key)?.label ?? key;
    issues.push({
      key,
      severity: "warning",
      code: "action_param_unmapped",
      message: `${stepLabel} : « ${label} » sera demandé à l'exécution ou à mapper.`,
    });
  }

  return issues;
}
