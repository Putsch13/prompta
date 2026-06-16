import { createAdminClient } from "@/lib/supabase/admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Lit le flag d'annulation coopérative d'un run (best-effort). */
export async function isCancelRequested(runId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("listing_agent_runs")
      .select("cancel_requested, status")
      .eq("id", runId)
      .single();
    return Boolean(data?.cancel_requested) || data?.status === "cancelled";
  } catch {
    return false;
  }
}

/** Marque le run comme annulé. */
export async function markRunCancelled(runId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin
      .from("listing_agent_runs")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", runId);
  } catch {
    // best-effort
  }
}
