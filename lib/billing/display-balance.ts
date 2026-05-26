import { CREDIT_VALUE_CENTS } from "./credits";
import { costToCredits } from "./credits";

/** Affichage unifié du solde wallet (balance = cents disponibles). */
export function formatBalanceCents(balanceCents: number) {
  const creditUnits = Math.floor(balanceCents / CREDIT_VALUE_CENTS);
  return {
    eur: (balanceCents / 100).toFixed(2),
    creditUnits,
    /** Coût estimé en unités crédits pour un run */
    estimateRunCredits: (costCents: number) => costToCredits(costCents),
  };
}
