/**
 * lib/agents/budget.ts
 * ────────────────────────────────────────────────────────────
 * GARDE-FOU FINANCIER — le module le plus important du système.
 *
 * Aucun agent ne peut appeler l'API Claude sans passer par ici.
 * Vérifie les plafonds quotidien ET mensuel AVANT chaque appel,
 * et enregistre le coût réel APRÈS.
 *
 * Si un plafond est atteint → l'agent est bloqué proprement.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// Tarifs Claude Sonnet (USD par million de tokens) — mets à jour si besoin
const PRICE_INPUT_PER_MTOK = 3.0;
const PRICE_OUTPUT_PER_MTOK = 15.0;

export type BudgetState = {
  daily_cap_usd: number;
  monthly_cap_usd: number;
  daily_spent_usd: number;
  monthly_spent_usd: number;
  is_paused: boolean;
  mode: "sandbox" | "live";
};

export type BudgetCheck =
  | { allowed: true; remaining_daily: number; remaining_monthly: number }
  | { allowed: false; reason: string };

/** Coût estimé d'un appel à partir du nombre de tokens. */
export function estimateCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * PRICE_INPUT_PER_MTOK +
    (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_MTOK
  );
}

/** Récupère l'état du budget et réinitialise les compteurs si nécessaire. */
export async function getBudget(): Promise<BudgetState> {
  const sb = createAdminClient();
  const { data, error } = await sb.from("agent_budget").select("*").eq("id", 1).single();
  if (error || !data) throw new Error("Budget introuvable — exécute la migration 0004.");

  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const patch: Record<string, unknown> = {};

  // Reset quotidien
  if (data.daily_reset_date !== today) {
    patch.daily_spent_usd = 0;
    patch.daily_reset_date = today;
  }
  // Reset mensuel
  if (data.monthly_reset_month !== month) {
    patch.monthly_spent_usd = 0;
    patch.monthly_reset_month = month;
  }
  if (Object.keys(patch).length > 0) {
    await sb.from("agent_budget").update(patch as {
      daily_spent_usd?: number;
      daily_reset_date?: string;
      monthly_spent_usd?: number;
      monthly_reset_month?: string;
    }).eq("id", 1);
    Object.assign(data, patch);
  }

  return {
    daily_cap_usd: Number(data.daily_cap_usd),
    monthly_cap_usd: Number(data.monthly_cap_usd),
    daily_spent_usd: Number(data.daily_spent_usd),
    monthly_spent_usd: Number(data.monthly_spent_usd),
    is_paused: data.is_paused,
    mode: (data.mode as "sandbox" | "live") ?? "sandbox",
  };
}

/**
 * À appeler AVANT chaque appel API.
 * `projectedCost` = estimation du coût de l'appel à venir.
 */
export async function checkBudget(projectedCost = 0.05): Promise<BudgetCheck> {
  const b = await getBudget();

  if (b.is_paused) {
    return { allowed: false, reason: "Coupe-circuit activé (budget en pause)." };
  }
  if (b.daily_spent_usd + projectedCost > b.daily_cap_usd) {
    return {
      allowed: false,
      reason: `Plafond quotidien atteint (${b.daily_spent_usd.toFixed(2)}/${b.daily_cap_usd}$).`,
    };
  }
  if (b.monthly_spent_usd + projectedCost > b.monthly_cap_usd) {
    return {
      allowed: false,
      reason: `Plafond mensuel atteint (${b.monthly_spent_usd.toFixed(2)}/${b.monthly_cap_usd}$).`,
    };
  }
  return {
    allowed: true,
    remaining_daily: b.daily_cap_usd - b.daily_spent_usd,
    remaining_monthly: b.monthly_cap_usd - b.monthly_spent_usd,
  };
}

/** À appeler APRÈS chaque appel API pour enregistrer la dépense réelle. */
export async function recordSpend(inputTokens: number, outputTokens: number): Promise<number> {
  const cost = estimateCost(inputTokens, outputTokens);
  const sb = createAdminClient();
  const b = await getBudget();
  await sb
    .from("agent_budget")
    .update({
      daily_spent_usd: b.daily_spent_usd + cost,
      monthly_spent_usd: b.monthly_spent_usd + cost,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  return cost;
}
