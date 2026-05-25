import { createAdminClient } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/agent/orchestrator";
import { getUserKey } from "@/lib/keys";

const POLL_MS = 3000;

async function processPendingRuns() {
  const admin = createAdminClient();

  const { data: jobs } = await admin
    .from("listing_agent_runs")
    .select("id, user_id, listing_id, version_id, inputs")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(3);

  for (const job of jobs ?? []) {
    await admin
      .from("listing_agent_runs")
      .update({ status: "running" })
      .eq("id", job.id);

    try {
      const { data: version } = await admin
        .from("listing_versions")
        .select("env")
        .eq("id", job.version_id ?? "")
        .single();

      const manifest = version?.env;
      if (!manifest) throw new Error("Manifeste agent manquant");

      const providers = ["openai", "anthropic", "google", "mistral", "serper"] as const;
      const apiKeys: Record<string, string> = {};
      for (const p of providers) {
        const key = await getUserKey(job.user_id, p);
        if (key) apiKeys[p] = key;
      }

      const inputs = (job.inputs as Record<string, string>) ?? {};
      const result = await runAgent(manifest, {
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
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur worker";
      await admin
        .from("listing_agent_runs")
        .update({ status: "failed", error_message: message })
        .eq("id", job.id);
    }
  }
}

async function loop() {
  console.log("[worker] démarré — polling listing_agent_runs pending");
  while (true) {
    try {
      await processPendingRuns();
    } catch (err) {
      console.error("[worker] erreur:", err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

loop();
