import { createAdminClient } from "@/lib/supabase/admin";
import { costToCredits, CREDIT_VALUE_CENTS } from "@/lib/billing/credits";

/* eslint-disable @typescript-eslint/no-explicit-any */

export { CREDIT_PACKS } from "@/lib/credit-packs";
export { costToCredits, creditsToEur, CREDIT_VALUE_CENTS, MARKUP } from "@/lib/billing/credits";

export async function getCreditBalance(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_credits")
    .select("balance_cents, held_cents")
    .eq("user_id", userId)
    .maybeSingle() as { data: { balance_cents: number; held_cents?: number } | null };
  const balance = data?.balance_cents ?? 0;
  const held = (data as { held_cents?: number } | null)?.held_cents ?? 0;
  return balance - held;
}

export async function getAvailableBalance(userId: string): Promise<number> {
  return getCreditBalance(userId);
}

export async function addCredits(
  userId: string,
  amountCents: number,
  kind: "purchase" | "bonus" | "refund",
  description: string,
  stripeSessionId?: string
): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_credits")
    .select("balance_cents")
    .eq("user_id", userId)
    .maybeSingle();
  const current = data?.balance_cents ?? 0;

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

/** Pré-autorisation : bloque des crédits avant un run. */
export async function holdCreditsForRun(
  userId: string,
  estimatedCostCents: number,
  runId: string
): Promise<boolean> {
  const admin = createAdminClient();
  const creditsNeeded = costToCredits(estimatedCostCents) * CREDIT_VALUE_CENTS;

  const { data } = await admin
    .from("user_credits")
    .select("balance_cents, held_cents")
    .eq("user_id", userId)
    .maybeSingle() as { data: { balance_cents: number; held_cents?: number } | null };

  const balance = data?.balance_cents ?? 0;
  const held = (data as { held_cents?: number } | null)?.held_cents ?? 0;
  const available = balance - held;

  if (available < creditsNeeded) return false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin.from("user_credits") as any).upsert({
    user_id: userId,
    balance_cents: balance,
    held_cents: held + creditsNeeded,
    updated_at: new Date().toISOString(),
  });

  await (admin.from("credit_transactions") as any).insert({
    user_id: userId,
    amount_cents: -creditsNeeded,
    kind: "hold",
    description: "Pré-autorisation run",
    run_id: runId,
  });

  return true;
}

/** Régularise après run : débit réel + libération du hold. */
export async function settleCreditsForRun(
  userId: string,
  actualCostCents: number,
  estimatedCostCents: number,
  runId: string
): Promise<void> {
  const admin = createAdminClient();
  const actualCredits = costToCredits(actualCostCents) * CREDIT_VALUE_CENTS;
  const heldCredits = costToCredits(estimatedCostCents) * CREDIT_VALUE_CENTS;

  const { data } = await admin
    .from("user_credits")
    .select("balance_cents, held_cents")
    .eq("user_id", userId)
    .maybeSingle() as { data: { balance_cents: number; held_cents?: number } | null };

  const balance = data?.balance_cents ?? 0;
  const held = (data as { held_cents?: number } | null)?.held_cents ?? 0;

  const newHeld = Math.max(0, held - heldCredits);
  const newBalance = Math.max(0, balance - actualCredits);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin.from("user_credits") as any).upsert({
    user_id: userId,
    balance_cents: newBalance,
    held_cents: newHeld,
    updated_at: new Date().toISOString(),
  });

  if (heldCredits > actualCredits) {
    await (admin.from("credit_transactions") as any).insert({
      user_id: userId,
      amount_cents: heldCredits - actualCredits,
      kind: "hold_release",
      description: "Libération pré-autorisation",
      run_id: runId,
    });
  }

  await (admin.from("credit_transactions") as any).insert({
    user_id: userId,
    amount_cents: -actualCredits,
    kind: "run_debit",
    description: "Exécution (coût réel)",
    run_id: runId,
  });
}

/** Débit simple (legacy / petits runs). */
export async function debitCreditsForRun(
  userId: string,
  runId: string,
  actualCostCents: number
): Promise<boolean> {
  const creditsNeeded = costToCredits(actualCostCents) * CREDIT_VALUE_CENTS;
  const balance = await getAvailableBalance(userId);
  if (balance < creditsNeeded) return false;

  const admin = createAdminClient();
  const { data } = await admin
    .from("user_credits")
    .select("balance_cents")
    .eq("user_id", userId)
    .maybeSingle();

  await admin.from("user_credits").upsert({
    user_id: userId,
    balance_cents: (data?.balance_cents ?? 0) - creditsNeeded,
    updated_at: new Date().toISOString(),
  });

  await admin.from("credit_transactions").insert({
    user_id: userId,
    amount_cents: -creditsNeeded,
    kind: "run_debit",
    description: "Exécution prompt",
    run_id: runId,
  });

  return true;
}
