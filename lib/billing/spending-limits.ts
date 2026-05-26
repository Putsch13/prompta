import { createAdminClient } from "@/lib/supabase/admin";
import { CREDIT_VALUE_CENTS, costToCredits } from "@/lib/billing/credits";

/** Plafond mensuel de dépense crédits par utilisateur (cents). */
export const MONTHLY_SPEND_CAP_CENTS = 5000; // 50 €

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
  const spent = await getMonthlySpendCents(userId);
  const estimatedDebit = costToCredits(estimatedCostCents) * CREDIT_VALUE_CENTS;
  if (spent + estimatedDebit > MONTHLY_SPEND_CAP_CENTS) {
    return {
      allowed: false,
      message: `Plafond mensuel atteint (${MONTHLY_SPEND_CAP_CENTS / 100} €) — réessayez le mois prochain ou utilisez vos clés BYOK.`,
    };
  }
  return { allowed: true };
}
