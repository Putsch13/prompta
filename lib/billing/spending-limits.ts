import { createAdminClient } from "@/lib/supabase/admin";
import { CREDIT_VALUE_CENTS, costToCredits } from "@/lib/billing/credits";
import { getUserPlan } from "@/lib/billing/entitlements";

/** Plancher du plafond mensuel de dépense crédits (cents) — plan gratuit. */
export const MONTHLY_SPEND_CAP_CENTS = 5000; // 50 €

/**
 * Plafond mensuel effectif : anti-abus, jamais un frein pour un abonné.
 * Un plan qui inclut X € de crédits/mois peut en dépenser au moins 2×X
 * (crédits inclus + recharges), avec un plancher à 50 €.
 * Scale : 100 € inclus → 200 € de plafond ; Free/Starter : 50 €.
 */
export async function getMonthlySpendCapCents(userId: string): Promise<number> {
  try {
    const { plan, unrestricted } = await getUserPlan(userId);
    if (unrestricted) return Number.MAX_SAFE_INTEGER;
    return Math.max(MONTHLY_SPEND_CAP_CENTS, plan.monthlyCreditCents * 2);
  } catch {
    return MONTHLY_SPEND_CAP_CENTS;
  }
}

export async function getMonthlySpendCents(userId: string): Promise<number> {
  const admin = createAdminClient();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data } = await admin
    .from("credit_transactions")
    .select("amount_cents")
    .eq("user_id", userId)
    .eq("kind", "run_debit")
    .gte("created_at", startOfMonth.toISOString());

  return (data ?? []).reduce((sum, row) => sum + Math.abs(row.amount_cents), 0);
}

export async function checkMonthlySpendCap(
  userId: string,
  estimatedCostCents: number
): Promise<{ allowed: boolean; message?: string }> {
  const [spent, cap] = await Promise.all([
    getMonthlySpendCents(userId),
    getMonthlySpendCapCents(userId),
  ]);
  const estimatedDebit = costToCredits(estimatedCostCents) * CREDIT_VALUE_CENTS;
  if (spent + estimatedDebit > cap) {
    return {
      allowed: false,
      message: `Plafond mensuel atteint (${cap / 100} €) — passe au plan supérieur, réessaie le mois prochain ou utilise tes clés BYOK.`,
    };
  }
  return { allowed: true };
}
