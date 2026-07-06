/**
 * Plans Prompta — SOURCE DE VÉRITÉ UNIQUE (pricing, quotas, crédits inclus).
 *
 * Modèle « à la Cursor » :
 *  - Découverte (gratuit) : 1 agent publié, 2 € de crédits IA offerts à
 *    l'inscription, BYOK illimité (ses propres clés API ne consomment jamais
 *    de crédits).
 *  - Plans payants : plus d'agents publiés + crédits IA inclus chaque mois.
 *  - Les crédits à la carte (packs) restent disponibles sur tous les plans.
 */

export type PlanId = "free" | "starter" | "pro" | "scale";

export interface PromptaPlan {
  id: PlanId;
  label: string;
  /** € / mois, en centimes. 0 = gratuit. */
  priceCents: number;
  /** Agents/workflows publiés simultanément. null = illimité. */
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
    tagline: "Construis et héberge ton premier agent — gratuitement.",
    features: [
      "1 agent hébergé en production",
      "2 € de crédits IA offerts (GPT + Claude)",
      "Builder visuel + copilote IA illimités",
      "800+ applications connectables",
      "Tes propres clés API (BYOK) sans limite",
      "Validation humaine & logs en direct",
    ],
  },
  starter: {
    id: "starter",
    label: "Starter",
    priceCents: 1900,
    publishedAgentLimit: 5,
    monthlyCreditCents: 1000,
    tagline: "Pour lancer tes premiers agents en production.",
    features: [
      "5 agents en production",
      "10 € de crédits IA inclus / mois",
      "Tous les modèles (GPT, Claude, Gemini, Mistral)",
      "Runs illimités en BYOK",
      "Notifications email des validations",
      "Support standard",
    ],
  },
  pro: {
    id: "pro",
    label: "Pro",
    priceCents: 4900,
    publishedAgentLimit: 20,
    monthlyCreditCents: 3000,
    tagline: "Pour ceux dont les agents travaillent tous les jours.",
    highlight: true,
    features: [
      "20 agents en production",
      "30 € de crédits IA inclus / mois",
      "Déclencheurs planifiés (cron) & webhooks",
      "File d'exécution prioritaire",
      "Dossiers de mission illimités (archives)",
      "Support prioritaire",
    ],
  },
  scale: {
    id: "scale",
    label: "Scale",
    priceCents: 14900,
    publishedAgentLimit: null,
    monthlyCreditCents: 10000,
    tagline: "Pour les équipes et les agences.",
    features: [
      "Agents en production illimités",
      "100 € de crédits IA inclus / mois",
      "Organisations & sièges (équipe)",
      "Webhooks & déclencheurs planifiés",
      "SLA & accompagnement dédié",
      "Facturation entreprise",
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

/** Décision de publication (fonction pure, testable). */
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
