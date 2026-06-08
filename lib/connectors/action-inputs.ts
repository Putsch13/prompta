/**
 * Source unique des entrées d'une étape action.
 *
 * Priorité au registre natif (UX curatée pour Gmail/Sheets/Slack…), sinon on
 * lit le `inputsSchema` snapshoté sur l'étape (outils Composio arbitraires).
 * Ainsi le contrat, le résolveur et l'inspecteur fonctionnent pour n'importe
 * lequel des 300+ connecteurs sans entrée codée en dur.
 */

import { getConnectorAction } from "@/lib/connectors/registry";
import type { ActionInput } from "@/lib/connectors/types";

interface ActionLike {
  connector?: string;
  action?: string;
  inputsSchema?: ActionInput[];
}

export function actionInputsFor(connector?: string, action?: string): ActionInput[] | undefined {
  if (!connector || !action) return undefined;
  const native = getConnectorAction(connector, action);
  return native?.inputs;
}

/** Entrées d'une étape : registre natif sinon snapshot embarqué sur l'étape. */
export function actionInputsForStep(step: ActionLike): ActionInput[] {
  const native = actionInputsFor(step.connector, step.action);
  if (native && native.length > 0) return native;
  if (Array.isArray(step.inputsSchema)) return step.inputsSchema;
  return [];
}
