import { createAdminClient } from "@/lib/supabase/admin";
import {
  releaseAgentRunCredits,
} from "@/lib/billing/agent-run-billing";

const STALE_HEARTBEAT_MS = 5 * 60 * 1000; // 5 min sans heartbeat = stale
const STALE_CREATED_MS = 15 * 60 * 1000;  // 15 min depuis created_at (fallback si pas de heartbeat)

/**
 * Marque les runs bloqués comme failed ou les remet en pending pour reprise.
 * Priorité : heartbeat_at si dispo, sinon started_at, sinon created_at.
 * Si steps_completed > 0 et output partiel → reprise via resume_from_step.
 */
export async function reapStaleRunningRuns(): Promise<number> {
  const admin = createAdminClient();

  const heartbeatCutoff = new Date(Date.now() - STALE_HEARTBEAT_MS).toISOString();
  const createdCutoff = new Date(Date.now() - STALE_CREATED_MS).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  const { data: staleHeartbeat } = await db
    .from("listing_agent_runs")
    .select("id, user_id, used_credits, credit_hold_estimate_cents, steps_completed, output")
    .eq("status", "running")
    .not("heartbeat_at", "is", null)
    .lt("heartbeat_at", heartbeatCutoff);

  const { data: staleLegacy } = await db
    .from("listing_agent_runs")
    .select("id, user_id, used_credits, credit_hold_estimate_cents, steps_completed, output")
    .eq("status", "running")
    .is("heartbeat_at", null)
    .lt("created_at", createdCutoff);

  const stale = [...(staleHeartbeat ?? []), ...(staleLegacy ?? [])];
  if (stale.length === 0) return 0;

  for (const run of stale) {
    const stepsCompleted = Number(run.steps_completed ?? 0);
    const hasPartialOutput =
      run.output &&
      typeof run.output === "object" &&
      Object.keys(run.output as object).length > 0;

    if (stepsCompleted > 0 && hasPartialOutput) {
      await db
        .from("listing_agent_runs")
        .update({
          status: "pending",
          resume_from_step: stepsCompleted,
          claimed_by: null,
          heartbeat_at: null,
          error_message: "Reprise automatique après interruption worker",
        })
        .eq("id", run.id)
        .eq("status", "running");

      console.warn("[worker:reap] stale run rescheduled for resume", {
        runId: run.id,
        resumeFromStep: stepsCompleted,
      });
      continue;
    }

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
