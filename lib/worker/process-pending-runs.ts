import { createAdminClient } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/agent/orchestrator";
import { parseListingEnv } from "@/lib/agent/env";
import {
  resolveAgentRunKeys,
  settleAgentRunCredits,
  releaseAgentRunCredits,
} from "@/lib/billing/agent-run-billing";
import { randomUUID } from "crypto";
import { checkConnectorHealth } from "@/lib/connectors/connection-health";

const HEARTBEAT_INTERVAL_MS = 5_000;

function workerId(): string {
  const hostname = typeof process !== "undefined" ? (process.env.HOSTNAME ?? process.env.RENDER_INSTANCE_ID ?? "local") : "unknown";
  return `${hostname}-${randomUUID().slice(0, 8)}`;
}

export async function processPendingAgentRuns(limit = 3): Promise<number> {
  const admin = createAdminClient();
  const wid = workerId();

  const { data: jobs } = await admin
    .from("listing_agent_runs")
    .select("id, user_id, listing_id, version_id, inputs, dry_run, used_credits, credit_hold_estimate_cents")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  let processed = 0;

  for (const job of jobs ?? []) {
    const startMs = Date.now();

    console.info("[worker] claiming run", { runId: job.id, listingId: job.listing_id, worker: wid });

    const now = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: claimed } = await (admin as any)
      .from("listing_agent_runs")
      .update({
        status: "running",
        started_at: now,
        heartbeat_at: now,
        claimed_by: wid,
      })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("id, user_id, listing_id, version_id, inputs, dry_run, used_credits, credit_hold_estimate_cents")
      .maybeSingle();

    if (!claimed) {
      console.info("[worker] run already claimed by another worker", { runId: job.id });
      continue;
    }

    console.info("[worker] started run", { runId: claimed.id, listingId: claimed.listing_id, worker: wid });

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

      if (parsed.manifest.connectors.length > 0 && !claimed.dry_run) {
        const healthIssues = await checkConnectorHealth(
          claimed.user_id,
          parsed.manifest.connectors,
        );
        if (healthIssues.length > 0) {
          const msg = healthIssues.map((i) => i.message).join("\n");
          throw new Error(`Connecteurs indisponibles :\n${msg}`);
        }
      }

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

      const heartbeatTimer = setInterval(async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (admin as any)
            .from("listing_agent_runs")
            .update({ heartbeat_at: new Date().toISOString() })
            .eq("id", claimed.id);
        } catch {
          // heartbeat failure is non-fatal
        }
      }, HEARTBEAT_INTERVAL_MS);

      let result;
      try {
        result = await runAgent(parsed.manifest, {
          userId: claimed.user_id,
          listingId: claimed.listing_id ?? "",
          inputs,
          apiKeys: billing.apiKeys,
          runId: claimed.id,
          dryRun: claimed.dry_run ?? false,
          onProgress: async (stepsCompleted) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (admin as any)
              .from("listing_agent_runs")
              .update({
                steps_completed: stepsCompleted,
                heartbeat_at: new Date().toISOString(),
              })
              .eq("id", claimed.id);
          },
        });
      } finally {
        clearInterval(heartbeatTimer);
      }

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

      const durationMs = Date.now() - startMs;
      console.info("[worker] completed run", {
        runId: claimed.id,
        status: result.status,
        stepsCompleted: result.stepsCompleted,
        durationMs,
      });

      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur worker";
      const durationMs = Date.now() - startMs;

      console.error("[worker] failed run", {
        runId: claimed.id,
        errorCode: err instanceof Error ? err.constructor.name : "unknown",
        message: message.slice(0, 500),
        durationMs,
      });

      if (claimed.used_credits && claimed.credit_hold_estimate_cents != null) {
        await releaseAgentRunCredits(
          claimed.user_id,
          claimed.id,
          Number(claimed.credit_hold_estimate_cents)
        ).catch((e) => console.error("[worker] release hold failed", { runId: claimed.id, err: e }));
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
