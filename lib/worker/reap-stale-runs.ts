import { createAdminClient } from "@/lib/supabase/admin";

const STALE_THRESHOLD_MS = 15 * 60 * 1000;

/**
 * Marque les runs bloqués en `running` depuis plus de 15 min comme failed.
 * Retourne le nombre de runs nettoyés.
 */
export async function reapStaleRunningRuns(): Promise<number> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();

  const { data: stale } = await admin
    .from("listing_agent_runs")
    .select("id")
    .eq("status", "running")
    .lt("created_at", cutoff);

  if (!stale || stale.length === 0) return 0;

  for (const run of stale) {
    await admin
      .from("listing_agent_runs")
      .update({
        status: "failed",
        error_message: "Timeout : run bloqué depuis plus de 15 minutes (stale worker reap)",
      })
      .eq("id", run.id)
      .eq("status", "running");

    console.warn("[worker:reap] stale run cleaned", { runId: run.id });
  }

  return stale.length;
}

export async function getRunHealthStats(): Promise<{
  pendingRuns: number;
  runningRuns: number;
  staleRuns: number;
}> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();

  const { count: pendingRuns } = await admin
    .from("listing_agent_runs")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  const { count: runningRuns } = await admin
    .from("listing_agent_runs")
    .select("*", { count: "exact", head: true })
    .eq("status", "running");

  const { count: staleRuns } = await admin
    .from("listing_agent_runs")
    .select("*", { count: "exact", head: true })
    .eq("status", "running")
    .lt("created_at", cutoff);

  return {
    pendingRuns: pendingRuns ?? 0,
    runningRuns: runningRuns ?? 0,
    staleRuns: staleRuns ?? 0,
  };
}
