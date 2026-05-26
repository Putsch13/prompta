/**
 * Moteur de rentabilité SCALE-5 — une seule source de vérité pour la facturation crédits.
 */

import { CREDIT_VALUE_CENTS, MARKUP, costToCredits } from "./credits";

/** Coût réel → montant débité en cents wallet (avec marge). */
export function billedCentsFromCost(actualCostCents: number): number {
  return costToCredits(actualCostCents) * CREDIT_VALUE_CENTS;
}

/** Marge plateforme en cents (revenu crédits − coût API). */
export function marginCentsFromCost(actualCostCents: number): number {
  const billed = billedCentsFromCost(actualCostCents);
  const costInWalletUnits = Math.ceil(actualCostCents);
  return Math.max(0, billed - costInWalletUnits);
}

/** Vérifie que la marge structurelle est positive (MARKUP > 1). */
export function assertProfitableMarkup(): void {
  if (MARKUP <= 1) {
    throw new Error("MARKUP doit être > 1 pour que le mode crédits soit rentable.");
  }
}

export function estimateHoldCents(estimatedCostCents: number): number {
  return billedCentsFromCost(estimatedCostCents);
}

export { CREDIT_VALUE_CENTS, MARKUP, costToCredits };
