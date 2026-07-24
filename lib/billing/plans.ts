/**
 * Plans Prompta — SOURCE DE VÉRITÉ UNIQUE (pricing, quotas, crédits inclus).
 *
 * Modèle 3 offres (refonte 2026-07-24) :
 *  - Découverte (0 €)  : extension + 2 € offerts + BYOK — fait entrer.
 *  - Illimité (29 €)   : agents gardés illimités + 35 € de crédits IA / mois.
 *  - Pro (99 €)        : 10 postes + 120 € de crédits IA / mois. Au-delà : sur devis.
 *
 * Les crédits inclus sont NON REPORTABLES (décision 2026-07-24) : l'allocation
 * est remplacée à chaque facture, pas additionnée (migration 0052). Seules les
 * recharges achetées à la carte sont permanentes.
 *
 * INVARIANT DE RENTABILITÉ (« com ≥ 20 % ») : même si l'abonné consomme 100 %
 * de ses crédits inclus, la marge nette reste ≥ 20 % du montant payé :
 *   marge = payé − crédits/MARKUP(1,6) − frais Stripe (≈ 1,5 % + 0,25 €)
 * D'où le plafond structurel MAX_CREDIT_GRANT_RATIO : on n'accorde JAMAIS plus
 * de 1,22 € de crédits par euro réellement payé — quelle que soit la facture
 * (prix legacy, prorata de changement de plan, coupon). Vérifié par
 * tests/unit/plans.test.ts ; détail chiffré dans docs/BUSINESS-PLAN.md.
 */

export type PlanId = "free" | "illimite" | "pro";

export interface PromptaPlan {
  id: PlanId;
  label: string;
  /** € / mois, en centimes. 0 = gratuit. */
  priceCents: number;
  /** Agents « gardés » (réutilisables) simultanément. null = illimité. */
  publishedAgentLimit: number | null;
  /** Crédits IA inclus chaque mois (centimes de crédit). NON reportables. */
  monthlyCreditCents: number;
  /** Postes (« desks ») autorisés sur le même compte. */
  deskLimit: number;
  tagline: string;
  features: string[];
  highlight?: boolean;
}

/** Crédits IA offerts à l'inscription (une seule fois). */
export const WELCOME_CREDIT_CENTS = 200; // 2 €

/**
 * Plafond structurel : crédits mensuels accordés ≤ 1,22 × montant payé.
 * 1,22/1,6 = 76,25 % du payé en coût API max → ≥ ~21 % de marge nette
 * après frais Stripe pour toute facture ≥ 19 €.
 */
export const MAX_CREDIT_GRANT_RATIO = 1.22;

/** Crédits mensuels max accordables pour un montant réellement payé. */
export function maxMonthlyGrantCents(amountPaidCents: number): number {
  return Math.floor(Math.max(0, amountPaidCents) * MAX_CREDIT_GRANT_RATIO);
}

export const PLANS: Record<PlanId, PromptaPlan> = {
  free: {
    id: "free",
    label: "Découverte",
    priceCents: 0,
    publishedAgentLimit: 1,
    monthlyCreditCents: 0,
    deskLimit: 1,
    tagline: "Prompta partout + 2 € offerts — sans carte.",
    features: [
      "Extension Prompta partout (Chrome & Chromium)",
      "Tac au tac + missions d'agent (sur crédits ou BYOK)",
      "2 € de crédits IA offerts à l'inscription",
      "Tous les modèles (GPT, Claude, Gemini, Mistral)",
      "1000+ apps connectables",
      "Tes propres clés API (BYOK) : runs illimités",
      "1 agent gardé dans ta bibliothèque",
      "Validations humaines (email inclus) & dossier de run",
    ],
  },
  illimite: {
    id: "illimite",
    label: "Illimité",
    priceCents: 2900,
    publishedAgentLimit: null,
    monthlyCreditCents: 3500,
    deskLimit: 1,
    tagline: "L'usage quotidien : agents illimités, crédits compris.",
    highlight: true,
    features: [
      "Tout Découverte",
      "35 € de crédits IA inclus chaque mois — plus que ton abonnement",
      "Agents gardés illimités",
      "Tous les modèles au choix : GPT, Claude, Gemini, Mistral",
      "Allocation remise à neuf chaque mois (non reportable)",
      "Recharge de crédits à la carte — celles-ci n'expirent jamais",
      "Support standard par email",
    ],
  },
  pro: {
    id: "pro",
    label: "Pro",
    priceCents: 9900,
    publishedAgentLimit: null,
    monthlyCreditCents: 12000,
    deskLimit: 10,
    tagline: "Usage intensif : multi-desk et gros volume de crédits.",
    features: [
      "Tout Illimité",
      "120 € de crédits IA inclus chaque mois",
      "Multi-desk : jusqu'à 10 postes sur le même compte",
      "Plafond anti-abus relevé à 240 € de dépense / mois",
      "Support prioritaire + accompagnement à la mise en place",
      "Au-delà (équipe, volume, SLA) : offre sur devis",
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "illimite", "pro"];

/** Normalise une valeur de plan stockée en base (legacy inclus). */
export function normalizePlanId(raw: string | null | undefined): PlanId {
  if (!raw) return "free";
  if (raw in PLANS) return raw as PlanId;
  // Legacy pré-refonte 2026-07-24 : Scale 149 € → Pro. Starter 19 €, très
  // ancien « pro » 19,99 € et inconnus → Illimité. Les grants mensuels de ces
  // abonnés restent bornés par maxMonthlyGrantCents(montant payé) : aucun
  // mapping ne peut rendre un abonnement déficitaire.
  if (raw === "scale") return "pro";
  return "illimite";
}

export function planFor(id: PlanId): PromptaPlan {
  return PLANS[id];
}

/** Décision de publication / agents gardés (fonction pure, testable). */
export function canPublishOnPlan(
  plan: PromptaPlan,
  publishedCount: number,
): { allowed: boolean; limit: number | null } {
  if (plan.publishedAgentLimit == null) return { allowed: true, limit: null };
  return {
    allowed: publishedCount < plan.publishedAgentLimit,
    limit: plan.publishedAgentLimit,
  };
}
