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
  const { data } = await db()
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

  await db()
    .from("listing_agent_runs")
    .update({ status: "awaiting_approval", paused_at_step: params.stepIndex })
    .eq("id", params.runId);

  if (!data) throw new Error("Création de l'approbation échouée");

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
): Promise<string | undefined> {
  if (!versionId) return undefined;
  try {
    const { data: version } = await db()
      .from("listing_versions")
      .select("env, prompt_body")
      .eq("id", versionId)
      .single();
    const { parseListingEnv } = await import("@/lib/agent/env");
    const parsed = parseListingEnv(version?.env, version?.prompt_body);
    const step = parsed?.manifest.steps?.[stepIndex];
    return step && "outputKey" in step ? (step.outputKey as string | undefined) : undefined;
  } catch {
    return undefined;
  }
}

export async function decideApproval(
  approvalId: string,
  userId: string,
  decision: "approved" | "rejected",
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
    .select("user_id")
    .eq("id", approval.run_id)
    .single();

  if (!run || run.user_id !== userId) return null;

  if (decision === "rejected") {
    await db()
      .from("agent_approvals")
      .update({
        status: "rejected",
        decided_at: new Date().toISOString(),
        decided_by: userId,
      })
      .eq("id", approvalId);
    await db()
      .from("listing_agent_runs")
      .update({ status: "failed", error_message: "Action rejetée par l'utilisateur" })
      .eq("id", approval.run_id);
    return null;
  }

  const payload = (approval.payload ?? {}) as { preview?: string; label?: string };
  const approvedContent = options?.modifiedContent?.trim() || payload.preview || "";

  const { data: runRow } = await db()
    .from("listing_agent_runs")
    .select("output, steps_completed, version_id")
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
  const approvalOutputKey = await approvalStepOutputKey(runRow?.version_id, stepIndex);
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

  await db()
    .from("listing_agent_runs")
    .update({
      status: "pending",
      resume_from_step: stepIndex + 1,
      steps_completed: stepIndex + 1,
      output: mergedOutput as Json,
      error_message: null,
    })
    .eq("id", approval.run_id);

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
