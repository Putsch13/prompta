import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/types.db";

function db() {
  return createAdminClient();
}

export async function createPendingApproval(params: {
  runId: string;
  stepId?: string;
  stepIndex: number;
  payload: Record<string, unknown>;
  expiresInMinutes?: number;
}): Promise<string> {
  // 24 h par défaut : une validation humaine doit pouvoir attendre le retour
  // de l'utilisateur (l'ancien défaut 60 min donnait l'impression que la
  // demande disparaissait si on ne répondait pas tout de suite).
  const expiresAt = new Date(Date.now() + (params.expiresInMinutes ?? 24 * 60) * 60 * 1000);
  const { data, error: insertErr } = await db()
    .from("agent_approvals")
    .insert({
      run_id: params.runId,
      step_id: params.stepId ?? `step_${params.stepIndex}`,
      step_index: params.stepIndex,
      status: "pending",
      payload: params.payload as Json,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();

  // Insert échoué → NE PAS mettre le run en pause (pause orpheline : la page
  // Validations serait vide alors que le run attend indéfiniment).
  if (insertErr || !data) {
    throw new Error(`Création de l'approbation échouée${insertErr ? ` : ${insertErr.message}` : ""}`);
  }

  // La ligne agent_approvals est la SOURCE DE VÉRITÉ de la pause. Le statut
  // « awaiting_approval » du run est cosmétique : si la contrainte de statut
  // de la prod est en retard (drift 0029/0045), on continue sans lui — les
  // API dérivent l'état d'attente depuis l'approbation pendante.
  const { error: pauseErr } = await db()
    .from("listing_agent_runs")
    .update({ status: "awaiting_approval", paused_at_step: params.stepIndex })
    .eq("id", params.runId);
  if (pauseErr) {
    console.error(
      "[approvals] statut awaiting_approval refusé (appliquer la migration 0045) :",
      pauseErr.message,
    );
    await db()
      .from("listing_agent_runs")
      .update({ paused_at_step: params.stepIndex })
      .eq("id", params.runId);
  }

  // Notification email best-effort (fire-and-forget) : l'utilisateur est
  // prévenu même s'il n'a pas l'app ouverte, avec le contenu à valider.
  void notifyApprovalByEmail(params.runId, data.id, params.payload).catch((e) =>
    console.warn("[approvals] email notification failed:", e),
  );

  return data.id;
}

async function notifyApprovalByEmail(
  runId: string,
  approvalId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;

  const { data: run } = await db()
    .from("listing_agent_runs")
    .select("user_id, listing_id")
    .eq("id", runId)
    .single();
  if (!run) return;

  const { data: userData } = await db().auth.admin.getUserById(run.user_id);
  const email = userData?.user?.email;
  if (!email) return;

  let agentTitle = "Votre agent";
  if (run.listing_id) {
    const { data: listing } = await db()
      .from("listings")
      .select("title")
      .eq("id", run.listing_id)
      .single();
    if (listing?.title) agentTitle = listing.title;
  }

  const { sendApprovalRequestEmail } = await import("@/lib/email");
  await sendApprovalRequestEmail({
    to: email,
    agentTitle,
    stepLabel: typeof payload.label === "string" ? payload.label : undefined,
    preview: typeof payload.preview === "string" ? payload.preview : undefined,
    approvalId,
    runId,
  });
}

/** outputKey de l'étape d'approbation (pour câbler le contenu validé aux étapes aval). */
async function approvalStepOutputKey(
  versionId: string | null | undefined,
  stepIndex: number,
  runInputs?: Record<string, unknown> | null,
): Promise<string | undefined> {
  // Run tamponné __guarded : il a exécuté le manifeste GARDÉ — stepIndex est
  // en coordonnées gardées. Il faut re-garder le manifeste relu avant
  // d'indexer, sinon on résout l'outputKey d'une AUTRE étape (garde
  // déterministe : même résultat qu'à l'exécution).
  const { hasApprovalGuardStamp, ensureApprovalGuards } = await import("@/lib/agent/approval-guards");
  const stamped = hasApprovalGuardStamp(runInputs);
  // Run de test (pas de version publiée) : le manifeste voyage dans le run.
  // Sans ce fallback, l'outputKey validé restait absent et l'étape aval
  // échouait en « Paramètre non renseigné » après reprise.
  if (!versionId) {
    try {
      const embedded = runInputs?.__manifest;
      if (typeof embedded === "string") {
        let manifest = JSON.parse(embedded) as { steps?: Array<Record<string, unknown>> };
        if (stamped) {
          const { AgentManifestSchema } = await import("@/lib/agent/schema");
          const reparsed = AgentManifestSchema.safeParse(manifest);
          if (reparsed.success) {
            manifest = ensureApprovalGuards(reparsed.data) as unknown as {
              steps?: Array<Record<string, unknown>>;
            };
          }
        }
        const step = manifest.steps?.[stepIndex];
        const key = step?.outputKey;
        return typeof key === "string" && key.trim() ? key : undefined;
      }
    } catch {
      // best-effort
    }
    return undefined;
  }
  try {
    const { data: version } = await db()
      .from("listing_versions")
      .select("env, prompt_body")
      .eq("id", versionId)
      .single();
    const { parseListingEnv } = await import("@/lib/agent/env");
    const parsed = parseListingEnv(version?.env, version?.prompt_body);
    if (!parsed) return undefined;
    const manifest = stamped ? ensureApprovalGuards(parsed.manifest) : parsed.manifest;
    const step = manifest.steps?.[stepIndex];
    return step && "outputKey" in step ? (step.outputKey as string | undefined) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `skipped` : passer CETTE écriture et poursuivre la mission.
 *
 * Il n'existait que « valider » et « refuser », et refuser tuait le run entier
 * — sur une mission à 10 envois, refuser le 7ᵉ détruisait aussi les 3 suivants.
 *
 * Note d'implémentation : la ligne est enregistrée avec le statut `rejected`,
 * marquée `skipped` dans son payload, plutôt qu'avec un statut dédié. La
 * colonne porte un CHECK (`pending|approved|rejected|expired`, migration 0029)
 * et l'historique de ce dépôt montre des migrations partiellement appliquées en
 * production : introduire une valeur nouvelle ferait échouer la décision en
 * base là où le schéma est en retard. `rejected` n'est de toute façon pas
 * `pending`, donc les trois dérivations de statut de run restent correctes.
 */
export type ApprovalDecision = "approved" | "rejected" | "skipped";

export async function decideApproval(
  approvalId: string,
  userId: string,
  decision: ApprovalDecision,
  options?: { modifiedContent?: string },
): Promise<{ runId: string; stepIndex: number } | null> {
  const { data: approval } = await db()
    .from("agent_approvals")
    .select("*")
    .eq("id", approvalId)
    .single();

  if (!approval || approval.status !== "pending") return null;

  const { data: run } = await db()
    .from("listing_agent_runs")
    .select("user_id, used_credits, credit_hold_estimate_cents")
    .eq("id", approval.run_id)
    .single();

  if (!run || run.user_id !== userId) return null;

  if (decision === "rejected") {
    // Garde anti-course (reaper d'expiration, double clic) : un seul update
    // gagne — si l'approbation n'est plus pending, ne pas re-clore le run.
    const { data: updated } = await db()
      .from("agent_approvals")
      .update({
        status: "rejected",
        decided_at: new Date().toISOString(),
        decided_by: userId,
      })
      .eq("id", approvalId)
      .eq("status", "pending")
      .select("id");
    if (!updated?.length) return null;
    await db()
      .from("listing_agent_runs")
      .update({ status: "failed", error_message: "Action rejetée par l'utilisateur" })
      .eq("id", approval.run_id);
    // Libère le hold de crédits : le reaper ne repasse jamais sur un run
    // failed — sans ça, le hold ampute le solde affiché à vie.
    if (run.used_credits && run.credit_hold_estimate_cents != null) {
      const { releaseAgentRunCredits } = await import("@/lib/billing/agent-run-billing");
      await releaseAgentRunCredits(
        userId,
        approval.run_id,
        Number(run.credit_hold_estimate_cents),
      ).catch((e) => console.error("[approvals] release hold failed (rejected)", e));
    }
    return null;
  }

  const payload = (approval.payload ?? {}) as { preview?: string; full?: string; label?: string; kind?: string };

  if (decision === "skipped") {
    // Une QUESTION n'est pas « passable » : sa réponse alimente les étapes
    // aval, la sauter les priverait de leur entrée.
    if (payload.kind === "question") {
      throw new Error("Cette étape est une question : réponds-y, ou annule la mission.");
    }
    const { data: updated } = await db()
      .from("agent_approvals")
      .update({
        status: "rejected",
        decided_at: new Date().toISOString(),
        decided_by: userId,
        payload: { ...payload, skipped: true } as Json,
      })
      .eq("id", approvalId)
      .eq("status", "pending")
      .select("id");
    if (!updated?.length) return null;

    const skipIndex = approval.step_index ?? 0;
    const { data: skipRow } = await db()
      .from("listing_agent_runs")
      .select("output")
      .eq("id", approval.run_id)
      .single();
    const skipOutput = {
      ...((skipRow?.output as Record<string, string> | null) ?? {}),
      [`approval_${skipIndex}`]: "[PASSÉ PAR L'UTILISATEUR]",
    };
    // +2 : l'approbation est en `skipIndex`, l'écriture qu'elle garde en
    // `skipIndex + 1` — on saute les deux et on reprend à la suivante.
    const resume = {
      status: "pending",
      resume_from_step: skipIndex + 2,
      steps_completed: skipIndex + 2,
      output: skipOutput as Json,
      error_message: null,
    };
    const { error: skipErr } = await db()
      .from("listing_agent_runs")
      .update({ ...resume, queued_at: new Date().toISOString() })
      .eq("id", approval.run_id);
    if (skipErr) {
      // Drift 0051 (queued_at absente) : même repli que la reprise normale.
      console.error("[approvals] reprise (skip) avec queued_at refusée:", skipErr.message);
      await db().from("listing_agent_runs").update(resume).eq("id", approval.run_id);
    }
    return { runId: approval.run_id, stepIndex: skipIndex };
  }

  // Une QUESTION (étape ask) : la sortie DOIT être la réponse tapée par
  // l'utilisateur. Pas de repli sur preview (= le texte de la question), sinon
  // l'étape aval reçoit la question à la place de la réponse.
  const isQuestion = payload.kind === "question";
  const answer = options?.modifiedContent?.trim() ?? "";
  if (isQuestion && !answer) {
    throw new Error("Réponse vide : réponds à la question pour que la mission continue.");
  }
  // Priorité : contenu modifié par l'humain > contenu intégral > préview (anciens runs).
  const approvedContent = isQuestion ? answer : (options?.modifiedContent?.trim() || payload.full || payload.preview || "");

  const { data: runRow } = await db()
    .from("listing_agent_runs")
    .select("output, steps_completed, version_id, inputs")
    .eq("id", approval.run_id)
    .single();

  const priorOutput =
    runRow?.output && typeof runRow.output === "object"
      ? (runRow.output as Record<string, string>)
      : {};
  const stepIndex = approval.step_index ?? 0;
  const stepKey = `step_${stepIndex}_output`;
  const mergedOutput: Record<string, string> = {
    ...priorOutput,
    [stepKey]: approvedContent,
    [`step_${stepIndex}`]: approvedContent,
    [`approval_${stepIndex}`]: approvedContent,
  };

  // Le contenu validé doit aussi être disponible sous l'outputKey de l'étape
  // d'approbation, sinon une étape aval qui référence {{outputKey}} ne le
  // retrouve pas à la reprise.
  const approvalOutputKey = await approvalStepOutputKey(
    runRow?.version_id,
    stepIndex,
    runRow?.inputs as Record<string, unknown> | null,
  );
  if (approvalOutputKey) mergedOutput[approvalOutputKey] = approvedContent;

  await db()
    .from("agent_approvals")
    .update({
      status: "approved",
      decided_at: new Date().toISOString(),
      decided_by: userId,
      payload: {
        ...payload,
        approvedContent,
      } as Json,
    })
    .eq("id", approvalId);

  const resumeRow = {
    status: "pending",
    resume_from_step: stepIndex + 1,
    steps_completed: stepIndex + 1,
    output: mergedOutput as Json,
    error_message: null,
  };
  const { error: resumeErr } = await db()
    .from("listing_agent_runs")
    .update({
      ...resumeRow,
      // Remise en file = fenêtre de fraîcheur RE-timestampée : le reaper des
      // pending juge sur queued_at — sur created_at, une approbation tranchée
      // après > 10 min voyait sa reprise tuée (et le hold libéré) avant qu'un
      // worker la prenne.
      queued_at: new Date().toISOString(),
    })
    .eq("id", approval.run_id);
  if (resumeErr) {
    // Drift 0051 (colonne queued_at absente) : sans ce repli, l'update entier
    // était rejeté et le run restait GELÉ en awaiting_approval après que
    // l'utilisateur a validé — le pire des symptômes « ça plante ».
    console.error("[approvals] reprise avec queued_at refusée (appliquer 0051), retry sans:", resumeErr.message);
    await db().from("listing_agent_runs").update(resumeRow).eq("id", approval.run_id);
  }

  return { runId: approval.run_id, stepIndex };
}

export async function listPendingApprovals(userId: string) {
  const { data } = await db()
    .from("agent_approvals")
    .select("*, listing_agent_runs!inner(id, listing_id, user_id)")
    .eq("listing_agent_runs.user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return data ?? [];
}
