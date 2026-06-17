import { createAdminClient } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/agent/orchestrator";
import { parseListingEnv } from "@/lib/agent/env";
import {
  resolveAgentRunKeys,
  settleAgentRunCredits,
  releaseAgentRunCredits,
} from "@/lib/billing/agent-run-billing";
import { randomUUID } from "crypto";
import { checkConnectorHealth, blockingHealthIssues } from "@/lib/connectors/connection-health";
import { runnerRequiredConnectors } from "@/lib/agent/run-connectors";
import { captureError } from "@/lib/observability";

const HEARTBEAT_INTERVAL_MS = 5_000;

function workerId(): string {
  const hostname = typeof process !== "undefined" ? (process.env.HOSTNAME ?? process.env.RENDER_INSTANCE_ID ?? "local") : "unknown";
  return `${hostname}-${randomUUID().slice(0, 8)}`;
}

function parseResumeOutputs(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export async function processPendingAgentRuns(limit = 3): Promise<number> {
  const admin = createAdminClient();
  const wid = workerId();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jobs } = await admin
    .from("listing_agent_runs")
    .select("id, user_id, listing_id, version_id, inputs, dry_run, used_credits, credit_hold_estimate_cents, resume_from_step, output, steps_completed")
    .eq("status", "pending")
    .eq("cancel_requested", false)
    .order("created_at", { ascending: true })
    .limit(limit);

  let processed = 0;

  for (const job of jobs ?? []) {
    const startMs = Date.now();
    const resumeFromStep = typeof job.resume_from_step === "number" ? job.resume_from_step : 0;
    const resumeOutputs = parseResumeOutputs(job.output);

    console.info("[worker] claiming run", {
      runId: job.id,
      listingId: job.listing_id,
      worker: wid,
      resumeFromStep,
    });

    const now = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: claimed } = await admin
      .from("listing_agent_runs")
      .update({
        status: "running",
        started_at: now,
        heartbeat_at: now,
        claimed_by: wid,
        resume_from_step: null,
      })
      .eq("id", job.id)
      .eq("status", "pending")
      .eq("cancel_requested", false)
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
        .select("env, prompt_body, contract")
        .eq("id", claimed.version_id ?? "")
        .single();

      const parsed = parseListingEnv(version?.env, version?.prompt_body);
      if (!parsed) throw new Error("Manifeste agent manquant");

      // P1.6 + P3.3 : si la version a un contrat figé, on le réutilise tel quel
      // pour garantir qu'une reprise (worker) lit la même interface que le run initial.
      const frozenContract = (version?.contract ?? null) as
        | import("@/lib/agent/contract").AgentContract
        | null;

      // Source de vérité unique : mêmes connecteurs requis que la route de run
      // (exclut les étapes sharedEnv du créateur pour un run d'abonné).
      const requiredConnectors = runnerRequiredConnectors(parsed.manifest, {
        userId: claimed.user_id,
        creatorId: listing?.creator_id ?? undefined,
      });
      if (requiredConnectors.length > 0 && !claimed.dry_run) {
        const healthIssues = await checkConnectorHealth(
          claimed.user_id,
          requiredConnectors,
        );
        // Seuls les blocages réels (pas de connexion / token absent ou expiré)
        // arrêtent le run. Les signaux scope/identité non bloquants laissent
        // l'exécution tenter l'accès (l'erreur réelle sera alors diagnostiquée).
        const blockers = blockingHealthIssues(healthIssues);
        if (blockers.length > 0) {
          const msg = blockers.map((i) => i.message).join("\n");
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
      const { buildRunResourcesFromInputs } = await import("@/lib/agent/build-run-resources");
      const { cleanInputs, resources } = buildRunResourcesFromInputs(parsed.manifest, inputs);

      const heartbeatTimer = setInterval(async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await admin
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
          creatorId: listing?.creator_id,
          inputs: cleanInputs,
          resources,
          apiKeys: billing.apiKeys,
          runId: claimed.id,
          dryRun: claimed.dry_run ?? false,
          resumeFromStep,
          resumeOutputs,
          ...(frozenContract ? { contract: frozenContract } : {}),
          onProgress: async (stepsCompleted, partialOutput) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await admin
              .from("listing_agent_runs")
              .update({
                steps_completed: stepsCompleted,
                heartbeat_at: new Date().toISOString(),
                ...(partialOutput ? { output: partialOutput } : {}),
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
        } else if (result.status !== "awaiting_approval") {
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
          // En attente d'approbation = pas une erreur : on n'enregistre pas de
          // message d'erreur (sinon le run paraît échoué dans l'UI).
          error_message: result.status === "awaiting_approval" ? null : (result.error ?? null),
          heartbeat_at: new Date().toISOString(),
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

      void captureError(err, {
        scope: "worker.run",
        runId: claimed.id,
        listingId: claimed.listing_id,
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
        .update({
          status: "failed",
          error_message: message,
          heartbeat_at: new Date().toISOString(),
        })
        .eq("id", claimed.id);
      processed++;
    }
  }

  return processed;
}
