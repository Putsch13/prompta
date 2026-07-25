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

  // Cutoff sur queued_at, PAS created_at : une reprise (post-approbation,
  // replan, resume auto) remet en pending un run dont created_at peut avoir
  // des heures — le juger là-dessus tuait la reprise (et libérait son hold)
  // avant qu'un worker la prenne. queued_at est re-timestampé à chaque
  // (re)mise en pending ; fallback created_at pour les lignes d'avant la
  // migration 0051 (queued_at null).
  const { data: staleQueued, error: queuedErr } = await db
    .from("listing_agent_runs")
    .select("id, user_id, used_credits, credit_hold_estimate_cents")
    .eq("status", "pending")
    .not("queued_at", "is", null)
    .lt("queued_at", pendingCutoff);

  const { data: staleLegacy, error: legacyErr } = await db
    .from("listing_agent_runs")
    .select("id, user_id, used_credits, credit_hold_estimate_cents")
    .eq("status", "pending")
    .is("queued_at", null)
    .lt("created_at", pendingCutoff);

  let stalePending = [...(staleQueued ?? []), ...(staleLegacy ?? [])];
  if (queuedErr || legacyErr) {
    // Drift 0051 (colonne queued_at absente) : les deux requêtes ci-dessus
    // échouaient EN SILENCE → plus aucun pending moissonné, les runs jamais
    // pris restaient « En attente » à vie. Repli : jugement sur created_at
    // seul (comportement pré-0051).
    console.error(
      "[worker:reap] filtres queued_at refusés (appliquer 0051), repli created_at:",
      (queuedErr ?? legacyErr)?.message,
    );
    const { data: fallbackRows } = await db
      .from("listing_agent_runs")
      .select("id, user_id, used_credits, credit_hold_estimate_cents")
      .eq("status", "pending")
      .lt("created_at", pendingCutoff);
    stalePending = fallbackRows ?? [];
  }

  // Un run `authorizing` ne vit que quelques SECONDES entre l'insert et le
  // hold+promotion : attendre le cutoff pending (10 min) pour le clore
  // laissait l'utilisateur regarder un run gelé. 2 min = très large.
  const authorizingCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const reapedAuthorizing = await reapStaleAuthorizingRuns(authorizingCutoff).catch((e) => {
    console.error("[worker:reap] reap authorizing failed", e);
    return 0;
  });
  if (!stalePending.length) return reapedAuthorizing;

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

  return stalePending.length + reapedAuthorizing;
}

/**
 * Clôt les runs restés en `authorizing` : l'API est morte entre l'insert et le
 * hold de crédits (ou entre le hold et la bascule en pending). Le worker ne
 * claim jamais ce statut — sans ce passage, la ligne restait gelée à vie.
 */
async function reapStaleAuthorizingRuns(cutoffIso: string): Promise<number> {
  const db = createAdminClient();

  // Un run authorizing n'est jamais re-timestampé : created_at fait foi.
  const { data: staleAuthorizing } = await db
    .from("listing_agent_runs")
    .select("id, user_id, used_credits, credit_hold_estimate_cents")
    .eq("status", "authorizing")
    .lt("created_at", cutoffIso);

  if (!staleAuthorizing?.length) return 0;

  for (const run of staleAuthorizing) {
    const { data: updated } = await db
      .from("listing_agent_runs")
      .update({
        status: "failed",
        error_message:
          "Interruption pendant l'autorisation des crédits — le run n'a jamais démarré. Relancez l'agent.",
      })
      .eq("id", run.id)
      .eq("status", "authorizing")
      .select("id");
    if (!updated?.length) continue;

    // On ne sait pas si l'API est morte AVANT ou APRÈS avoir posé le hold.
    // release_credit_hold n'est pas gardé côté SQL (il décrémente held_cents
    // aveuglément) : libérer un hold jamais posé — ou déjà libéré par l'API —
    // fausserait la provision des autres runs de l'utilisateur. On ne libère
    // que si le solde de transactions le prouve : hold posé (RPC →
    // agent_run_id, fallback JS → run_id) ET pas encore libéré.
    if (run.used_credits && run.credit_hold_estimate_cents != null) {
      const { count: holdTxCount } = await db
        .from("credit_transactions")
        .select("*", { count: "exact", head: true })
        .eq("kind", "hold")
        .or(`agent_run_id.eq.${run.id},run_id.eq.${run.id}`);
      const { count: releaseTxCount } = await db
        .from("credit_transactions")
        .select("*", { count: "exact", head: true })
        .eq("kind", "hold_release")
        .or(`agent_run_id.eq.${run.id},run_id.eq.${run.id}`);

      if ((holdTxCount ?? 0) > (releaseTxCount ?? 0)) {
        await releaseAgentRunCredits(
          run.user_id,
          run.id,
          Number(run.credit_hold_estimate_cents),
        ).catch((e) =>
          console.error("[reap:authorizing] release credits failed", { runId: run.id, err: e }),
        );
      }
    }

    console.warn("[worker:reap] stale authorizing run failed", { runId: run.id });
  }

  return staleAuthorizing.length;
}

/**
 * Expire les validations humaines restées sans réponse (expires_at dépassé)
 * et clôt leurs runs. Sans ce passage, un run en attente d'une validation
 * jamais tranchée restait bloqué à vie — hold de crédits gelé compris — car le
 * reaper des runs stale exclut par design les runs à approbation pendante.
 */
export async function reapExpiredApprovals(): Promise<number> {
  const db = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: expired } = await db
    .from("agent_approvals")
    .select("id, run_id")
    .eq("status", "pending")
    .not("expires_at", "is", null)
    .lt("expires_at", nowIso);

  if (!expired?.length) return 0;

  let closed = 0;
  for (const approval of expired) {
    // Garde anti-course : si l'utilisateur tranche au même moment, un seul
    // update gagne (filtre status=pending) — on ne clôt le run que si on a
    // réellement expiré l'approbation.
    const { data: updated, error } = await db
      .from("agent_approvals")
      .update({ status: "expired", decided_at: nowIso })
      .eq("id", approval.id)
      .eq("status", "pending")
      .select("id");
    if (error || !updated?.length) continue;

    const { data: run } = await db
      .from("listing_agent_runs")
      .select("id, user_id, status, used_credits, credit_hold_estimate_cents")
      .eq("id", approval.run_id)
      .maybeSingle();
    if (!run || run.status === "completed" || run.status === "failed") continue;

    await db
      .from("listing_agent_runs")
      .update({
        status: "failed",
        error_message:
          "Validation expirée : aucune réponse dans le délai — mission annulée. Relance l'agent si besoin.",
      })
      .eq("id", run.id)
      .neq("status", "completed");

    if (run.used_credits && run.credit_hold_estimate_cents != null) {
      await releaseAgentRunCredits(
        run.user_id,
        run.id,
        Number(run.credit_hold_estimate_cents),
      ).catch((e) =>
        console.error("[worker:reap] release credits failed (approval expired)", {
          runId: run.id,
          err: e,
        }),
      );
    }

    closed += 1;
    console.warn("[worker:reap] approval expired, run closed", {
      runId: run.id,
      approvalId: approval.id,
    });
  }

  return closed;
}

export async function reapStaleRunningRuns(): Promise<number> {
  const admin = createAdminClient();

  // D'abord purger les validations expirées : leurs runs sortent de la liste
  // d'exclusion « pause légitime » ci-dessous et sont clos proprement.
  await reapExpiredApprovals().catch((e) =>
    console.error("[worker:reap] reapExpiredApprovals failed", e),
  );

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
          // Remise en file = nouvelle fenêtre de fraîcheur pour le reaper des
          // pending (sinon il jugerait la reprise sur le created_at d'origine).
          queued_at: new Date().toISOString(),
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
