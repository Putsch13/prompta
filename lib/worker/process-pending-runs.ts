import { createAdminClient } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/agent/orchestrator";
import { parseListingEnv } from "@/lib/agent/env";
import {
  resolveAgentRunKeys,
  settleAgentRunCredits,
  releaseAgentRunCredits,
} from "@/lib/billing/agent-run-billing";

export async function processPendingAgentRuns(limit = 3): Promise<number> {
  const admin = createAdminClient();

  const { data: jobs } = await admin
    .from("listing_agent_runs")
    .select("id, user_id, listing_id, version_id, inputs, dry_run, used_credits, credit_hold_estimate_cents")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  let processed = 0;

  for (const job of jobs ?? []) {
    const { data: claimed } = await admin
      .from("listing_agent_runs")
      .update({ status: "running" })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("id, user_id, listing_id, version_id, inputs, dry_run, used_credits, credit_hold_estimate_cents")
      .maybeSingle();

    if (!claimed) continue;

    try {
      const { data: listing } = await admin
        .from("listings")
        .select("price_cents, creator_id")
        .eq("id", claimed.listing_id ?? "")
        .single();

      const { data: version } = await admin
        .from("listing_versions")
        .select("env, prompt_body")
        .eq("id", claimed.version_id ?? "")
        .single();

      const parsed = parseListingEnv(version?.env, version?.prompt_body);
      if (!parsed) throw new Error("Manifeste agent manquant");

      const isFree = (listing?.price_cents ?? 0) === 0;
      const isOwner = listing?.creator_id === claimed.user_id;
      const billing = await resolveAgentRunKeys(
        claimed.user_id,
        parsed.manifest,
        isOwner,
        isFree,
        { consumeFreeQuota: false }
      );

      const inputs = (claimed.inputs as Record<string, string>) ?? {};
      const result = await runAgent(parsed.manifest, {
        userId: claimed.user_id,
        listingId: claimed.listing_id ?? "",
        inputs,
        apiKeys: billing.apiKeys,
        runId: claimed.id,
        dryRun: claimed.dry_run ?? false,
        onProgress: async (stepsCompleted) => {
          await admin
            .from("listing_agent_runs")
            .update({ steps_completed: stepsCompleted })
            .eq("id", claimed.id);
        },
      });

      if (claimed.used_credits && claimed.credit_hold_estimate_cents != null) {
        if (result.status === "completed" && result.usage) {
          await settleAgentRunCredits(
            claimed.user_id,
            claimed.id,
            { steps: result.usage },
            Number(claimed.credit_hold_estimate_cents)
          );
        } else {
          await releaseAgentRunCredits(
            claimed.user_id,
            claimed.id,
            Number(claimed.credit_hold_estimate_cents)
          );
        }
      }

      await admin
        .from("listing_agent_runs")
        .update({
          status: result.status,
          steps_completed: result.stepsCompleted,
          output: result.output,
          error_message: result.error ?? null,
        })
        .eq("id", claimed.id);

      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur worker";

      if (claimed.used_credits && claimed.credit_hold_estimate_cents != null) {
        await releaseAgentRunCredits(
          claimed.user_id,
          claimed.id,
          Number(claimed.credit_hold_estimate_cents)
        ).catch(() => undefined);
      }

      await admin
        .from("listing_agent_runs")
        .update({ status: "failed", error_message: message })
        .eq("id", claimed.id);
      processed++;
    }
  }

  return processed;
}
