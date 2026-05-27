import { createAdminClient } from "@/lib/supabase/admin";
import {
  releaseAgentRunCredits,
} from "@/lib/billing/agent-run-billing";

const STALE_HEARTBEAT_MS = 5 * 60 * 1000; // 5 min sans heartbeat = stale
const STALE_CREATED_MS = 15 * 60 * 1000;  // 15 min depuis created_at (fallback si pas de heartbeat)

/**
 * Marque les runs bloqués comme failed.
 * Priorité : heartbeat_at si dispo, sinon started_at, sinon created_at.
 * Libère les crédits retenus.
 */
export async function reapStaleRunningRuns(): Promise<number> {
  const admin = createAdminClient();

  const heartbeatCutoff = new Date(Date.now() - STALE_HEARTBEAT_MS).toISOString();
  const createdCutoff = new Date(Date.now() - STALE_CREATED_MS).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  // Runs avec heartbeat dépassé
  const { data: staleHeartbeat } = await db
    .from("listing_agent_runs")
    .select("id, user_id, used_credits, credit_hold_estimate_cents")
    .eq("status", "running")
    .not("heartbeat_at", "is", null)
    .lt("heartbeat_at", heartbeatCutoff);

  // Runs sans heartbeat mais créés il y a longtemps
  const { data: staleLegacy } = await db
    .from("listing_agent_runs")
    .select("id, user_id, used_credits, credit_hold_estimate_cents")
    .eq("status", "running")
    .is("heartbeat_at", null)
    .lt("created_at", createdCutoff);

  const stale = [...(staleHeartbeat ?? []), ...(staleLegacy ?? [])];
  if (stale.length === 0) return 0;

  for (const run of stale) {
    await admin
      .from("listing_agent_runs")
      .update({
        status: "failed",
        error_message: "Timeout : worker inactif (heartbeat absent), run annulé automatiquement",
      })
      .eq("id", run.id)
      .eq("status", "running");

    if (run.used_credits && run.credit_hold_estimate_cents != null) {
      await releaseAgentRunCredits(
        run.user_id,
        run.id,
        Number(run.credit_hold_estimate_cents),
      ).catch((e) => console.error("[reap] release credits failed", { runId: run.id, err: e }));
    }

    console.warn("[worker:reap] stale run cleaned", { runId: run.id });
  }

  return stale.length;
}

export async function getRunHealthStats(): Promise<{
  pendingRuns: number;
  runningRuns: number;
  staleRuns: number;
  failedLast24h: number;
}> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db2 = admin as any;
  const heartbeatCutoff = new Date(Date.now() - STALE_HEARTBEAT_MS).toISOString();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count: pendingRuns } = await db2
    .from("listing_agent_runs")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  const { count: runningRuns } = await db2
    .from("listing_agent_runs")
    .select("*", { count: "exact", head: true })
    .eq("status", "running");

  const { count: staleRuns } = await db2
    .from("listing_agent_runs")
    .select("*", { count: "exact", head: true })
    .eq("status", "running")
    .lt("heartbeat_at", heartbeatCutoff);

  const { count: failedLast24h } = await db2
    .from("listing_agent_runs")
    .select("*", { count: "exact", head: true })
    .eq("status", "failed")
    .gt("created_at", yesterday);

  return {
    pendingRuns: pendingRuns ?? 0,
    runningRuns: runningRuns ?? 0,
    staleRuns: staleRuns ?? 0,
    failedLast24h: failedLast24h ?? 0,
  };
}
