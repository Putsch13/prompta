import { createAdminClient } from "@/lib/supabase/admin";
import { costToCredits, CREDIT_VALUE_CENTS } from "@/lib/billing/credits";
import { billedCentsFromCost, marginCentsFromCost } from "@/lib/billing/profitability";
import { recordPlatformRunEconomics } from "@/lib/billing/circuit-breaker";

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

  // Idempotence : Stripe rejoue les webhooks (timeout/5xx) — un même checkout
  // ne doit créditer qu'une seule fois. La ligne de ledger est insérée EN
  // PREMIER : avec l'index unique (stripe_session_id, kind), une course entre
  // deux webhooks fait échouer le doublon (23505) AVANT de toucher au solde.
  if (stripeSessionId) {
    const { error: insertErr } = await admin.from("credit_transactions").insert({
      user_id: userId,
      amount_cents: amountCents,
      kind,
      description,
      stripe_session_id: stripeSessionId,
    });
    if (insertErr) {
      if (insertErr.code === "23505") return; // déjà crédité (retry/course)
      // Fallback pré-migration (index unique absent) : check-then-act.
      const { data: existing } = await admin
        .from("credit_transactions")
        .select("id")
        .eq("stripe_session_id", stripeSessionId)
        .eq("kind", kind)
        .maybeSingle();
      if (existing) return;
      throw new Error(`Ledger crédits inaccessible : ${insertErr.message}`);
    }
  } else {
    await admin.from("credit_transactions").insert({
      user_id: userId,
      amount_cents: amountCents,
      kind,
      description,
      stripe_session_id: null,
    });
  }

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
}

/**
 * Pré-autorisation : bloque des crédits avant un run.
 * Tente d'abord la RPC atomique (FOR UPDATE), fallback JS si pas migrée.
 */
export async function holdCreditsForRun(
  userId: string,
  estimatedCostCents: number,
  runId: string,
  runType: "prompt" | "agent" = "prompt"
): Promise<boolean> {
  const admin = createAdminClient();
  const creditsNeeded = costToCredits(estimatedCostCents) * CREDIT_VALUE_CENTS;

  // Try atomic RPC first
  const { data: rpcResult, error: rpcError } = await admin.rpc("hold_credits_for_run", {
    p_user_id: userId,
    p_amount_cents: creditsNeeded,
    p_run_id: runId,
    p_run_type: runType,
  });

  if (!rpcError) {
    return rpcResult === true;
  }

  // Fallback: RPC not yet deployed
  console.warn("[credits] hold RPC unavailable, using JS fallback:", rpcError.message);

  const { data } = await admin
    .from("user_credits")
    .select("balance_cents, held_cents")
    .eq("user_id", userId)
    .maybeSingle() as { data: { balance_cents: number; held_cents?: number } | null };

  const balance = data?.balance_cents ?? 0;
  const held = (data as { held_cents?: number } | null)?.held_cents ?? 0;
  const available = balance - held;

  if (available < creditsNeeded) return false;

  await admin.from("user_credits").upsert({
    user_id: userId,
    balance_cents: balance,
    held_cents: held + creditsNeeded,
    updated_at: new Date().toISOString(),
  });

  await admin.from("credit_transactions").insert({
    user_id: userId,
    amount_cents: -creditsNeeded,
    kind: "hold",
    description: "Pré-autorisation run",
    run_id: runId,
    run_type: runType,
  });

  return true;
}

/**
 * Libère un hold sans débit (run échoué ou annulé).
 */
export async function releaseCreditHold(
  userId: string,
  estimatedCostCents: number,
  runId: string,
  runType: "prompt" | "agent" = "prompt"
): Promise<void> {
  const admin = createAdminClient();
  const heldCredits = costToCredits(estimatedCostCents) * CREDIT_VALUE_CENTS;

  const { error: rpcError } = await admin.rpc("release_credit_hold", {
    p_user_id: userId,
    p_held_cents: heldCredits,
    p_run_id: runId,
    p_run_type: runType,
  });

  if (!rpcError) return;

  console.warn("[credits] release RPC unavailable, using JS fallback:", rpcError.message);

  const { data } = await admin
    .from("user_credits")
    .select("balance_cents, held_cents")
    .eq("user_id", userId)
    .maybeSingle() as { data: { balance_cents: number; held_cents?: number } | null };

  const balance = data?.balance_cents ?? 0;
  const held = (data as { held_cents?: number } | null)?.held_cents ?? 0;
  const newHeld = Math.max(0, held - heldCredits);

  await admin.from("user_credits").upsert({
    user_id: userId,
    balance_cents: balance,
    held_cents: newHeld,
    updated_at: new Date().toISOString(),
  });

  if (heldCredits > 0) {
    await admin.from("credit_transactions").insert({
      user_id: userId,
      amount_cents: heldCredits,
      kind: "hold_release",
      description: "Annulation pré-autorisation (run échoué)",
      run_id: runId,
      run_type: runType,
    });
  }
}

/**
 * Régularise après run : débit réel + libération du hold.
 */
export async function settleCreditsForRun(
  userId: string,
  actualCostCents: number,
  estimatedCostCents: number,
  runId: string,
  runType: "prompt" | "agent" = "prompt"
): Promise<void> {
  const admin = createAdminClient();
  const actualCredits = costToCredits(actualCostCents) * CREDIT_VALUE_CENTS;
  const heldCredits = costToCredits(estimatedCostCents) * CREDIT_VALUE_CENTS;

  const { error: rpcError } = await admin.rpc("settle_credits_for_run", {
    p_user_id: userId,
    p_actual_cents: actualCredits,
    p_held_cents: heldCredits,
    p_run_id: runId,
    p_run_type: runType,
  });

  if (!rpcError) {
    // Economics tracking (non-blocking)
    const billedCents = billedCentsFromCost(actualCostCents);
    const marginCents = marginCentsFromCost(actualCostCents);
    await recordPlatformRunEconomics({
      userId, runId, runType, actualCostCents, billedCents, marginCents,
    }).catch((err) => console.warn("[settleCreditsForRun] economics", err));
    return;
  }

  console.warn("[credits] settle RPC unavailable, using JS fallback:", rpcError.message);

  const { data } = await admin
    .from("user_credits")
    .select("balance_cents, held_cents")
    .eq("user_id", userId)
    .maybeSingle() as { data: { balance_cents: number; held_cents?: number } | null };

  const balance = data?.balance_cents ?? 0;
  const held = (data as { held_cents?: number } | null)?.held_cents ?? 0;

  const newHeld = Math.max(0, held - heldCredits);
  const newBalance = Math.max(0, balance - actualCredits);

  await admin.from("user_credits").upsert({
    user_id: userId,
    balance_cents: newBalance,
    held_cents: newHeld,
    updated_at: new Date().toISOString(),
  });

  if (heldCredits > actualCredits) {
    await admin.from("credit_transactions").insert({
      user_id: userId,
      amount_cents: heldCredits - actualCredits,
      kind: "hold_release",
      description: "Libération pré-autorisation",
      run_id: runId,
      run_type: runType,
    });
  }

  await admin.from("credit_transactions").insert({
    user_id: userId,
    amount_cents: -actualCredits,
    kind: "run_debit",
    description: "Exécution (coût réel)",
    run_id: runId,
    run_type: runType,
  });

  const billedCents = billedCentsFromCost(actualCostCents);
  const marginCents = marginCentsFromCost(actualCostCents);
  await recordPlatformRunEconomics({
    userId, runId, runType, actualCostCents, billedCents, marginCents,
  }).catch((err) => console.warn("[settleCreditsForRun] economics", err));
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
