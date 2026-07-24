/**
 * Recharges à la carte. Bonus croissant avec le montant, toujours sous le
 * plafond structurel MAX_CREDIT_GRANT_RATIO (1,22 € de crédits / € payé)
 * pour préserver la com ≥ 20 % au pire cas (voir lib/billing/plans.ts).
 */
export const CREDIT_PACKS = [
  { id: "pack_5", label: "5 €", amountCents: 500, creditsCents: 500 },
  { id: "pack_12", label: "12 €", amountCents: 1200, creditsCents: 1300 },
  { id: "pack_30", label: "30 €", amountCents: 3000, creditsCents: 3500 },
  { id: "pack_100", label: "100 €", amountCents: 10000, creditsCents: 12000 },
] as const;
