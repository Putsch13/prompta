import { createAdminClient } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/agent/orchestrator";
import { parseListingEnv } from "@/lib/agent/env";
import { getUserKey } from "@/lib/keys";

const PROVIDERS = ["openai", "anthropic", "google", "mistral", "serper"] as const;

export async function processPendingAgentRuns(limit = 3): Promise<number> {
  const admin = createAdminClient();

  const { data: jobs } = await admin
    .from("listing_agent_runs")
    .select("id, user_id, listing_id, version_id, inputs")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  let processed = 0;

  for (const job of jobs ?? []) {
    await admin.from("listing_agent_runs").update({ status: "running" }).eq("id", job.id);

    try {
      const { data: version } = await admin
        .from("listing_versions")
        .select("env, prompt_body")
        .eq("id", job.version_id ?? "")
        .single();

      const parsed = parseListingEnv(version?.env, version?.prompt_body);
      if (!parsed) throw new Error("Manifeste agent manquant");

      const apiKeys: Record<string, string> = {};
      for (const p of PROVIDERS) {
        const key = await getUserKey(job.user_id, p);
        if (key) apiKeys[p] = key;
      }

      const inputs = (job.inputs as Record<string, string>) ?? {};
      const result = await runAgent(parsed.manifest, {
        userId: job.user_id,
        listingId: job.listing_id ?? "",
        inputs,
        apiKeys,
      });

      await admin
        .from("listing_agent_runs")
        .update({
          status: result.status,
          steps_completed: result.stepsCompleted,
          output: result.output,
          error_message: result.error ?? null,
        })
        .eq("id", job.id);

      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur worker";
      await admin
        .from("listing_agent_runs")
        .update({ status: "failed", error_message: message })
        .eq("id", job.id);
      processed++;
    }
  }

  return processed;
}
