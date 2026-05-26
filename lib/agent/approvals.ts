import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): any {
  return createAdminClient();
}

export async function createPendingApproval(params: {
  runId: string;
  stepId?: string;
  stepIndex: number;
  payload: Record<string, unknown>;
  expiresInMinutes?: number;
}): Promise<string> {
  const expiresAt = new Date(Date.now() + (params.expiresInMinutes ?? 60) * 60 * 1000);
  const { data } = await db()
    .from("agent_approvals")
    .insert({
      run_id: params.runId,
      step_id: params.stepId ?? `step_${params.stepIndex}`,
      step_index: params.stepIndex,
      status: "pending",
      payload: params.payload,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();

  await db()
    .from("listing_agent_runs")
    .update({ status: "awaiting_approval", paused_at_step: params.stepIndex })
    .eq("id", params.runId);

  return data.id as string;
}

export async function decideApproval(
  approvalId: string,
  userId: string,
  decision: "approved" | "rejected"
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

  await db()
    .from("agent_approvals")
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by: userId,
    })
    .eq("id", approvalId);

  if (decision === "rejected") {
    await db()
      .from("listing_agent_runs")
      .update({ status: "failed", error_message: "Action rejetée par l'utilisateur" })
      .eq("id", approval.run_id);
    return null;
  }

  await db()
    .from("listing_agent_runs")
    .update({ status: "pending", resume_from_step: approval.step_index + 1 })
    .eq("id", approval.run_id);

  return { runId: approval.run_id, stepIndex: approval.step_index };
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
