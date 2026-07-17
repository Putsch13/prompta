/**
 * Plans Prompta — SOURCE DE VÉRITÉ UNIQUE (pricing, quotas, crédits inclus).
 *
 * Produit recentré sur Prompta partout (extension) + missions + validations :
 *  - Découverte : extension + 2 € offerts + BYOK
 *  - Payants : plus de crédits / mois + plus d'agents « gardés »
 *  - publishedAgentLimit = agents enregistrés depuis l'extension (save-agent)
 */

export type PlanId = "free" | "starter" | "pro" | "scale";

export interface PromptaPlan {
  id: PlanId;
  label: string;
  /** € / mois, en centimes. 0 = gratuit. */
  priceCents: number;
  /** Agents « gardés » (réutilisables) simultanément. null = illimité. */
  publishedAgentLimit: number | null;
  /** Crédits IA inclus chaque mois (centimes de crédit). */
  monthlyCreditCents: number;
  tagline: string;
  features: string[];
  highlight?: boolean;
}

/** Crédits IA offerts à l'inscription (une seule fois). */
export const WELCOME_CREDIT_CENTS = 200; // 2 €

export const PLANS: Record<PlanId, PromptaPlan> = {
  free: {
    id: "free",
    label: "Découverte",
    priceCents: 0,
    publishedAgentLimit: 1,
    monthlyCreditCents: 0,
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
  starter: {
    id: "starter",
    label: "Starter",
    priceCents: 1900,
    publishedAgentLimit: 5,
    monthlyCreditCents: 1000,
    tagline: "Pour utiliser Prompta partout tous les jours.",
    features: [
      "Tout Découverte",
      "10 € de crédits IA inclus chaque mois",
      "Crédits cumulables — le solde non utilisé reste acquis",
      "5 agents gardés",
      "Recharge de crédits à la carte",
      "Support standard par email",
    ],
  },
  pro: {
    id: "pro",
    label: "Pro",
    priceCents: 4900,
    publishedAgentLimit: 20,
    monthlyCreditCents: 3000,
    tagline: "Volume de missions + crédits confortables.",
    highlight: true,
    features: [
      "Tout Starter",
      "30 € de crédits IA inclus chaque mois",
      "20 agents gardés",
      "Support prioritaire (tes demandes passent en premier)",
    ],
  },
  scale: {
    id: "scale",
    label: "Scale",
    priceCents: 14900,
    publishedAgentLimit: null,
    monthlyCreditCents: 10000,
    tagline: "Pour un usage intensif.",
    features: [
      "Tout Pro",
      "100 € de crédits IA inclus chaque mois",
      "Agents gardés illimités",
      "Accompagnement dédié à la mise en place",
      "Priorité support maximale",
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "starter", "pro", "scale"];

/** Normalise une valeur de plan stockée en base (legacy inclus). */
export function normalizePlanId(raw: string | null | undefined): PlanId {
  if (!raw) return "free";
  if (raw in PLANS) return raw as PlanId;
  // Legacy : l'ancien abonnement unique « pro » (19,99 €) ≈ Starter actuel.
  if (raw === "pro_legacy" || raw === "platform_pro") return "starter";
  return "starter";
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
