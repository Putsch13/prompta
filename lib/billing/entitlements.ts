/**
 * Entitlements plan — qui a droit à quoi, et les crédits offerts.
 * S'appuie sur platform_subscriptions (Stripe) + profiles.unrestricted_usage.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { addCredits } from "@/lib/credits";
import {
  PLANS,
  planFor,
  normalizePlanId,
  canPublishOnPlan,
  WELCOME_CREDIT_CENTS,
  type PlanId,
  type PromptaPlan,
} from "./plans";

export interface UserPlanInfo {
  plan: PromptaPlan;
  planId: PlanId;
  /** Abonnement Stripe actif (null = plan gratuit). */
  stripeSubscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  /** Compte QA/admin exempté de tous les quotas. */
  unrestricted: boolean;
}

export async function getUserPlan(userId: string): Promise<UserPlanInfo> {
  const admin = createAdminClient();

  const [{ data: profile }, { data: sub }] = await Promise.all([
    admin.from("profiles").select("unrestricted_usage").eq("id", userId).maybeSingle(),
    admin
      .from("platform_subscriptions")
      .select("plan, status, stripe_subscription_id, cancel_at_period_end, current_period_end")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  const unrestricted = profile?.unrestricted_usage === true;
  const planId: PlanId = unrestricted ? "scale" : sub ? normalizePlanId(sub.plan) : "free";

  return {
    plan: planFor(planId),
    planId,
    stripeSubscriptionId: sub?.stripe_subscription_id ?? null,
    cancelAtPeriodEnd: sub?.cancel_at_period_end === true,
    currentPeriodEnd: sub?.current_period_end ?? null,
    unrestricted,
  };
}

/** Agents/workflows publiés (les prompts ne comptent pas dans le quota). */
export async function publishedAgentCount(
  userId: string,
  opts?: { excludeListingId?: string },
): Promise<number> {
  const admin = createAdminClient();
  let query = admin
    .from("listings")
    .select("*", { count: "exact", head: true })
    .eq("creator_id", userId)
    .neq("type", "prompt")
    .in("status", ["published", "under_review"]);
  if (opts?.excludeListingId) query = query.neq("id", opts.excludeListingId);
  const { count } = await query;
  return count ?? 0;
}

export interface PublishGateResult {
  allowed: boolean;
  planId: PlanId;
  limit: number | null;
  current: number;
  message?: string;
}

/** Porte de publication : quota d'agents publiés selon le plan. */
export async function canPublishAgent(
  userId: string,
  opts?: { excludeListingId?: string },
): Promise<PublishGateResult> {
  const info = await getUserPlan(userId);
  if (info.unrestricted) {
    return { allowed: true, planId: info.planId, limit: null, current: 0 };
  }
  const current = await publishedAgentCount(userId, opts);
  const { allowed, limit } = canPublishOnPlan(info.plan, current);
  return {
    allowed,
    planId: info.planId,
    limit,
    current,
    message: allowed
      ? undefined
      : `Ton plan ${info.plan.label} permet ${limit} agent${(limit ?? 0) > 1 ? "s" : ""} publié${(limit ?? 0) > 1 ? "s" : ""} (tu en as ${current}). Passe au plan supérieur pour publier celui-ci — ou dépublie un agent existant.`,
  };
}

/**
 * Crédits de bienvenue (2 €) — idempotent : la transaction est marquée
 * `welcome_<userId>` et addCredits refuse les doublons sur cette clé.
 */
export async function grantWelcomeCredits(userId: string): Promise<void> {
  await addCredits(
    userId,
    WELCOME_CREDIT_CENTS,
    "bonus",
    "Bienvenue sur Prompta — crédits IA offerts",
    `welcome_${userId}`,
  ).catch((e) => console.warn("[entitlements] welcome grant failed:", e));
}

/**
 * Crédits mensuels inclus dans le plan — idempotent par facture Stripe
 * (invoiceId) : un retry de webhook ne crédite jamais deux fois.
 */
export async function grantPlanMonthlyCredits(
  userId: string,
  planIdRaw: string | null | undefined,
  invoiceId: string,
): Promise<void> {
  const plan = PLANS[normalizePlanId(planIdRaw)];
  if (plan.monthlyCreditCents <= 0) return;
  await addCredits(
    userId,
    plan.monthlyCreditCents,
    "bonus",
    `Crédits IA inclus — plan ${plan.label}`,
    invoiceId,
  );
}
