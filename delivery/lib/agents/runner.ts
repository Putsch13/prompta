/**
 * lib/agents/runner.ts
 * ────────────────────────────────────────────────────────────
 * Orchestrateur. Lance un agent, journalise, gère les erreurs
 * et applique les limites (max runs/jour, agent désactivé...).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { BudgetBlockedError } from "./anthropic";
import type { AgentContext, AgentResult, AgentRunner, AgentSlug } from "./types";

// Registre des agents — rempli par agents/index.ts
import { AGENT_REGISTRY } from "@/agents";

export type StartRunResult =
  | { ok: true; runId: string; result: AgentResult }
  | { ok: false; reason: string };

/**
 * Lance un agent par son slug.
 * Effectue toutes les vérifications de sécurité avant de démarrer.
 */
export async function startAgentRun(
  slug: AgentSlug,
  trigger: "cron" | "manual"
): Promise<StartRunResult> {
  const sb = createAdminClient();

  // 1. L'agent existe-t-il et est-il activé ?
  const { data: def } = await sb
    .from("agent_definitions")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!def) return { ok: false, reason: `Agent inconnu : ${slug}` };
  if (!def.is_enabled) return { ok: false, reason: `Agent ${slug} désactivé.` };

  // 2. Limite de runs par jour
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const { count } = await sb
    .from("agent_runs")
    .select("*", { count: "exact", head: true })
    .eq("agent_slug", slug)
    .gte("started_at", since.toISOString());

  if ((count ?? 0) >= def.max_runs_per_day) {
    return {
      ok: false,
      reason: `Limite quotidienne atteinte pour ${slug} (${count}/${def.max_runs_per_day}).`,
    };
  }

  // 3. Le runner existe-t-il dans le registre ?
  const runner: AgentRunner | undefined = AGENT_REGISTRY[slug];
  if (!runner) return { ok: false, reason: `Pas d'implémentation pour ${slug}.` };

  // 3bis. Mode courant (sandbox / live) — détermine le marquage des données
  const { data: budgetRow } = await sb
    .from("agent_budget")
    .select("mode")
    .eq("id", 1)
    .single();
  const isSandbox = (budgetRow?.mode ?? "sandbox") === "sandbox";

  // 4. Créer le run (marqué sandbox si on est en mode test)
  const { data: run } = await sb
    .from("agent_runs")
    .insert({ agent_slug: slug, trigger, status: "running", is_sandbox: isSandbox })
    .select("id")
    .single();

  if (!run) return { ok: false, reason: "Impossible de créer le run." };
  const runId = run.id as string;

  // 5. Logger lié au run
  const log: AgentContext["log"] = async (level, message) => {
    await sb.from("agent_logs").insert({ run_id: runId, agent_slug: slug, level, message });
    console.log(`[${slug}] ${level}: ${message}`);
  };

  // 6. Exécuter
  try {
    await log("info", `Démarrage (${trigger})${isSandbox ? " — MODE SANDBOX" : ""}`);
    const result = await runner({
      runId,
      trigger,
      isSandbox,
      log,
      config: (def.config as Record<string, unknown>) ?? {},
    });

    await sb
      .from("agent_runs")
      .update({
        status: "done",
        items_produced: result.itemsProduced,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);

    await log("info", `Terminé — ${result.summary}`);
    return { ok: true, runId, result };
  } catch (err) {
    const isBudget = err instanceof BudgetBlockedError;
    const message = err instanceof Error ? err.message : String(err);

    await sb
      .from("agent_runs")
      .update({
        status: isBudget ? "blocked" : "failed",
        error: message,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);

    await log(isBudget ? "warn" : "error", isBudget ? `Bloqué : ${message}` : `Échec : ${message}`);
    return { ok: false, reason: message };
  }
}

/** Helper pour les agents : enregistre un output en attente de validation. */
export async function saveOutput(
  ctx: { runId: string; isSandbox: boolean },
  agentSlug: string,
  draft: {
    kind: string;
    title: string;
    payload: Record<string, unknown>;
    qualityScore?: number;
  }
): Promise<void> {
  const sb = createAdminClient();
  await sb.from("agent_outputs").insert({
    run_id: ctx.runId,
    agent_slug: agentSlug,
    kind: draft.kind,
    title: draft.title,
    payload: draft.payload,
    quality_score: draft.qualityScore ?? null,
    status: "pending",
    is_sandbox: ctx.isSandbox,
  });
}
