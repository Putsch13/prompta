/**
 * Coupe-circuit plateforme — stoppe les runs crédits si le coût journalier dépasse le plafond.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export const PLATFORM_DAILY_COST_CAP_CENTS = parseInt(
  process.env.PLATFORM_DAILY_COST_CAP_CENTS ?? "50000",
  10
);

export interface CircuitStatus {
  allowed: boolean;
  isPaused: boolean;
  dailyCostCents: number;
  dailyMarginCents: number;
  capCents: number;
  reason?: string;
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function ensureGuardRow(admin: AdminClient) {
  const today = new Date().toISOString().split("T")[0];

  const { data } = await admin.from("platform_credit_guard").select("*").eq("id", 1).maybeSingle();

  if (!data) {
    await admin.from("platform_credit_guard").insert({
      id: 1,
      is_paused: false,
      daily_cost_cents: 0,
      daily_margin_cents: 0,
      guard_day: today,
    });
    return;
  }

  if (data.guard_day !== today) {
    await admin
      .from("platform_credit_guard")
      .update({
        daily_cost_cents: 0,
        daily_margin_cents: 0,
        guard_day: today,
        is_paused: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
  }
}

export async function getCreditCircuitStatus(): Promise<CircuitStatus> {
  const admin = createAdminClient();
  await ensureGuardRow(admin);

  const { data } = await admin.from("platform_credit_guard").select("*").eq("id", 1).single();

  const dailyCostCents = Number(data?.daily_cost_cents ?? 0);
  const dailyMarginCents = Number(data?.daily_margin_cents ?? 0);
  const isPaused = Boolean(data?.is_paused);

  if (isPaused) {
    return {
      allowed: false,
      isPaused: true,
      dailyCostCents,
      dailyMarginCents,
      capCents: PLATFORM_DAILY_COST_CAP_CENTS,
      reason: "Mode crédits suspendu (coupe-circuit actif).",
    };
  }

  if (dailyCostCents >= PLATFORM_DAILY_COST_CAP_CENTS) {
    await admin.from("platform_credit_guard").update({ is_paused: true }).eq("id", 1);
    return {
      allowed: false,
      isPaused: true,
      dailyCostCents,
      dailyMarginCents,
      capCents: PLATFORM_DAILY_COST_CAP_CENTS,
      reason: `Plafond de coût plateforme atteint (${PLATFORM_DAILY_COST_CAP_CENTS / 100} €/jour).`,
    };
  }

  return {
    allowed: true,
    isPaused: false,
    dailyCostCents,
    dailyMarginCents,
    capCents: PLATFORM_DAILY_COST_CAP_CENTS,
  };
}

export async function recordPlatformRunEconomics(
  params: {
    userId: string;
    runId: string;
    runType: "prompt" | "agent";
    actualCostCents: number;
    billedCents: number;
    marginCents: number;
  },
  adminOverride?: AdminClient
): Promise<void> {
  const admin = adminOverride ?? createAdminClient();

  await admin.from("platform_run_economics").insert({
    user_id: params.userId,
    run_id: params.runId,
    run_type: params.runType,
    actual_cost_cents: params.actualCostCents,
    billed_cents: params.billedCents,
    margin_cents: params.marginCents,
  });

  // Incrément atomique (création de ligne + reset de jour inclus) : des
  // settles concurrents ne perdent plus d'incréments du compteur journalier.
  const { error: rpcError } = await admin.rpc("record_platform_daily_cost", {
    p_cost_cents: params.actualCostCents,
    p_margin_cents: params.marginCents,
    p_cap_cents: PLATFORM_DAILY_COST_CAP_CENTS,
  });
  if (!rpcError) return;

  // Fallback pré-migration 0050 : read-then-write (racy).
  console.warn("[circuit-breaker] daily cost RPC unavailable, using JS fallback:", rpcError.message);
  await ensureGuardRow(admin);

  const { data: guard } = await admin.from("platform_credit_guard").select("*").eq("id", 1).single();

  const newCost = Number(guard?.daily_cost_cents ?? 0) + params.actualCostCents;
  const newMargin = Number(guard?.daily_margin_cents ?? 0) + params.marginCents;

  await admin
    .from("platform_credit_guard")
    .update({
      daily_cost_cents: newCost,
      daily_margin_cents: newMargin,
      updated_at: new Date().toISOString(),
      is_paused: newCost >= PLATFORM_DAILY_COST_CAP_CENTS ? true : guard?.is_paused ?? false,
    })
    .eq("id", 1);
}

export async function pauseCreditMode(reason = "Pause manuelle"): Promise<void> {
  const admin = createAdminClient();
  await ensureGuardRow(admin);
  await admin.from("platform_credit_guard").update({ is_paused: true, updated_at: new Date().toISOString() }).eq("id", 1);
  console.warn("[circuit-breaker]", reason);
}

export async function resumeCreditMode(): Promise<void> {
  const admin = createAdminClient();
  await ensureGuardRow(admin);
  await admin.from("platform_credit_guard").update({ is_paused: false, updated_at: new Date().toISOString() }).eq("id", 1);
}
