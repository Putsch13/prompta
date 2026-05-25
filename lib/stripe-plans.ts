export const PROMPTA_PRO_PRICE_CENTS = 1999;

export const ORG_PLANS = {
  starter: { label: "Starter", priceCents: 4900, seats: 10 },
  team: { label: "Team", priceCents: 9900, seats: 50 },
  scale: { label: "Scale", priceCents: 29900, seats: 200 },
} as const;

export type OrgPlanKey = keyof typeof ORG_PLANS;
