/**
 * Moteur de crédits — décisions business (faciles à régler).
 */

export const CREDIT_VALUE_CENTS = 2;
export const MARKUP = 1.6;
export const FREE_RUNS_PER_DAY = 15;
export const FREE_TIER_MODEL = "gpt-5-nano";
export const FREE_RUN_MAX_TOKENS = 2000;

/** Convertit un coût réel (cents) en crédits facturés (avec marge). */
export function costToCredits(costCents: number): number {
  return Math.max(1, Math.ceil((costCents * MARKUP) / CREDIT_VALUE_CENTS));
}

/** Estimation en euros pour affichage. */
export function creditsToEur(credits: number): number {
  return (credits * CREDIT_VALUE_CENTS) / 100;
}
