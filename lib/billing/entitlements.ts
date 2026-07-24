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
  maxMonthlyGrantCents,
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
  const planId: PlanId = unrestricted ? "pro" : sub ? normalizePlanId(sub.plan) : "free";

  return {
    plan: planFor(planId),
    planId,
    stripeSubscriptionId: sub?.stripe_subscription_id ?? null,
    cancelAtPeriodEnd: sub?.cancel_at_period_end === true,
    currentPeriodEnd: sub?.current_period_end ?? null,
    unrestricted,
  };
}

/**
 * Agents « gardés » (réutilisables) — les prompts ne comptent pas dans le
 * quota. Les drafts comptent : un agent sauvegardé depuis l'extension est
 * relançable, donc « gardé », quel que soit son statut de publication.
 */
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
    .in("status", ["draft", "published", "under_review"]);
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
 * Renvoie true UNIQUEMENT au premier octroi (déclenche l'email de bienvenue
 * une seule fois).
 */
export async function grantWelcomeCredits(userId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("credit_transactions")
      .select("id")
      .eq("stripe_session_id", `welcome_${userId}`)
      .eq("kind", "bonus")
      .maybeSingle();
    if (existing) return false;

    await addCredits(
      userId,
      WELCOME_CREDIT_CENTS,
      "bonus",
      "Bienvenue sur Prompta — crédits IA offerts",
      `welcome_${userId}`,
    );
    return true;
  } catch (e) {
    console.warn("[entitlements] welcome grant failed:", e);
    return false;
  }
}

/**
 * Crédits mensuels inclus dans le plan — idempotent par facture Stripe
 * (invoiceId) : un retry de webhook ne crédite jamais deux fois.
 *
 * Garantie « com ≥ 20 % » : le grant est borné à 1,22 × le montant réellement
 * payé sur la facture (amountPaidCents). Une facture legacy (ancien prix), un
 * prorata de changement de plan ou un coupon ne peuvent donc jamais accorder
 * plus de crédits que ce que la marge supporte.
 */
export async function grantPlanMonthlyCredits(
  userId: string,
  planIdRaw: string | null | undefined,
  invoiceId: string,
  amountPaidCents?: number | null,
): Promise<void> {
  const plan = PLANS[normalizePlanId(planIdRaw)];
  if (plan.monthlyCreditCents <= 0) return;
  const granted =
    amountPaidCents != null
      ? Math.min(plan.monthlyCreditCents, maxMonthlyGrantCents(amountPaidCents))
      : plan.monthlyCreditCents;
  if (granted <= 0) return;

  const admin = createAdminClient();

  // Idempotence : le ledger porte la clé de facture. Insertion EN PREMIER —
  // un retry Stripe échoue sur l'index unique AVANT de toucher l'allocation
  // (sinon un rejeu remettrait le compteur à plein en écrasant la conso).
  const { error: ledgerErr } = await admin.from("credit_transactions").insert({
    user_id: userId,
    amount_cents: granted,
    kind: "bonus",
    description: `Crédits IA inclus — plan ${plan.label}`,
    stripe_session_id: invoiceId,
  });
  if (ledgerErr) {
    if (ledgerErr.code === "23505") return; // déjà accordé (retry/course)
    const { data: existing } = await admin
      .from("credit_transactions")
      .select("id")
      .eq("stripe_session_id", invoiceId)
      .eq("kind", "bonus")
      .maybeSingle();
    if (existing) return;
    throw new Error(`Ledger crédits inaccessible : ${ledgerErr.message}`);
  }

  // NON REPORTABLE : l'allocation est REMPLACÉE, pas additionnée. Le reliquat
  // du cycle précédent est perdu (use-it-or-lose-it) et tracé au ledger pour
  // que le solde reste explicable. 35 jours = cycle + marge de facturation.
  const expiresAt = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString();
  const { data: expired, error: rpcErr } = await admin.rpc("grant_plan_credits", {
    p_user_id: userId,
    p_amount_cents: granted,
    p_expire_at: expiresAt,
  });

  if (rpcErr) {
    // Fallback pré-migration 0052 : wallet unique (le report subsiste alors,
    // comportement de l'ancienne version — jamais de perte pour le client).
    console.warn("[entitlements] grant_plan_credits indisponible, repli wallet:", rpcErr.message);
    const { error: fallbackErr } = await admin.rpc("add_credits", {
      p_user_id: userId,
      p_amount_cents: granted,
    });
    if (fallbackErr) console.error("[entitlements] repli add_credits échoué:", fallbackErr.message);
    return;
  }

  const expiredCents = Number(expired ?? 0);
  if (expiredCents > 0) {
    const { error: expiryErr } = await admin.from("credit_transactions").insert({
      user_id: userId,
      amount_cents: -expiredCents,
      kind: "bonus",
      description: "Crédits du mois précédent expirés (non reportables)",
    });
    if (expiryErr) console.warn("[entitlements] trace d'expiration non écrite:", expiryErr.message);
  }
}
