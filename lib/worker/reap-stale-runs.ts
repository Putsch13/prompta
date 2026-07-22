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
const STALE_PENDING_MS = 10 * 60 * 1000; // 10 min en pending = jamais pris

export async function reapStalePendingRuns(): Promise<number> {
  const admin = createAdminClient();
  const db = admin;
  const pendingCutoff = new Date(Date.now() - STALE_PENDING_MS).toISOString();

  const { data: stalePending } = await db
    .from("listing_agent_runs")
    .select("id, user_id, used_credits, credit_hold_estimate_cents")
    .eq("status", "pending")
    .lt("created_at", pendingCutoff);

  if (!stalePending?.length) return 0;

  for (const run of stalePending) {
    await db
      .from("listing_agent_runs")
      .update({
        status: "failed",
        error_message:
          "Timeout : aucun worker n'a traité ce run. Vérifiez que le worker Prompta est actif.",
      })
      .eq("id", run.id)
      .eq("status", "pending");

    if (run.used_credits && run.credit_hold_estimate_cents != null) {
      await releaseAgentRunCredits(
        run.user_id,
        run.id,
        Number(run.credit_hold_estimate_cents),
      ).catch((e) => console.error("[reap:pending] release credits failed", { runId: run.id, err: e }));
    }

    console.warn("[worker:reap] stale pending run failed", { runId: run.id });
  }

  return stalePending.length;
}

export async function reapStaleRunningRuns(): Promise<number> {
  const admin = createAdminClient();

  const heartbeatCutoff = new Date(Date.now() - STALE_HEARTBEAT_MS).toISOString();
  const createdCutoff = new Date(Date.now() - STALE_CREATED_MS).toISOString();

  const db = admin;

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

  const staleAll = [...(staleHeartbeat ?? []), ...(staleLegacy ?? [])];
  if (staleAll.length === 0) return 0;

  // Un run en PAUSE de validation humaine peut être resté « running » en base
  // (drift de contrainte statut, migration 0045) : son heartbeat est gelé par
  // nature — le tuer détruirait une pause légitime. La ligne agent_approvals
  // pendante fait foi.
  const { data: pausedApprovals } = await db
    .from("agent_approvals")
    .select("run_id")
    .in("run_id", staleAll.map((r) => r.id))
    .eq("status", "pending");
  const pausedIds = new Set((pausedApprovals ?? []).map((a) => a.run_id));
  const stale = staleAll.filter((r) => !pausedIds.has(r.id));
  if (stale.length === 0) return 0;

  for (const run of stale) {
    const stepsCompleted = Number(run.steps_completed ?? 0);
    const hasPartialOutput =
      run.output &&
      typeof run.output === "object" &&
      Object.keys(run.output as object).length > 0;

    if (stepsCompleted > 0 && hasPartialOutput) {
      // Anti-rejeu : toute étape à effet de bord réel dans le monde — action
      // externe OU pilotage navigateur (clic « Envoyer », etc.) — bloque la
      // reprise automatique. Un `browser` a le step_type "browser", jamais
      // "action" : sans lui, le reaper rejouait les clics non idempotents.
      const { count: completedActions } = await db
        .from("listing_agent_run_steps")
        .select("*", { count: "exact", head: true })
        .eq("run_id", run.id)
        .in("step_type", ["action", "browser"])
        .eq("status", "success");

      if ((completedActions ?? 0) > 0) {
        await db
          .from("listing_agent_runs")
          .update({
            status: "failed",
            error_message:
              "Interruption après action externe — reprise automatique désactivée. Relancez manuellement depuis la console.",
            heartbeat_at: new Date().toISOString(),
          })
          .eq("id", run.id)
          .eq("status", "running");

        if (run.used_credits && run.credit_hold_estimate_cents != null) {
          await releaseAgentRunCredits(
            run.user_id,
            run.id,
            Number(run.credit_hold_estimate_cents),
          ).catch((e) =>
            console.error("[reap] release credits failed (sensitive resume blocked)", {
              runId: run.id,
              err: e,
            }),
          );
        }

        console.warn("[worker:reap] stale run blocked auto-resume (sensitive actions)", {
          runId: run.id,
          completedActions,
        });
        continue;
      }

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
        heartbeat_at: new Date().toISOString(),
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
  const db2 = admin;
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
