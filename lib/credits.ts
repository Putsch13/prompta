import { createAdminClient } from "@/lib/supabase/admin";
import { RUN_CREDIT_COST_CENTS } from "@/lib/credit-packs";

export { RUN_CREDIT_COST_CENTS } from "@/lib/credit-packs";
export { CREDIT_PACKS } from "@/lib/credit-packs";

export async function getCreditBalance(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_credits")
    .select("balance_cents")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.balance_cents ?? 0;
}

export async function addCredits(
  userId: string,
  amountCents: number,
  kind: "purchase" | "bonus" | "refund",
  description: string,
  stripeSessionId?: string
): Promise<void> {
  const admin = createAdminClient();
  const current = await getCreditBalance(userId);

  await admin.from("user_credits").upsert({
    user_id: userId,
    balance_cents: current + amountCents,
    updated_at: new Date().toISOString(),
  });

  await admin.from("credit_transactions").insert({
    user_id: userId,
    amount_cents: amountCents,
    kind,
    description,
    stripe_session_id: stripeSessionId ?? null,
  });
}

export async function debitCreditsForRun(
  userId: string,
  runId: string
): Promise<boolean> {
  const admin = createAdminClient();
  const balance = await getCreditBalance(userId);
  if (balance < RUN_CREDIT_COST_CENTS) return false;

  await admin.from("user_credits").upsert({
    user_id: userId,
    balance_cents: balance - RUN_CREDIT_COST_CENTS,
    updated_at: new Date().toISOString(),
  });

  await admin.from("credit_transactions").insert({
    user_id: userId,
    amount_cents: -RUN_CREDIT_COST_CENTS,
    kind: "run_debit",
    description: "Exécution prompt (clés plateforme)",
    run_id: runId,
  });

  return true;
}
