import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decideApproval } from "@/lib/agent/approvals";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const admin = createAdminClient();
  const { data: run } = await admin
    .from("listing_agent_runs")
    .select("user_id")
    .eq("id", params.runId)
    .single();

  if (!run || run.user_id !== user.id) {
    return NextResponse.json({ error: "Run introuvable" }, { status: 404 });
  }

  const body = await request.json();
  const { approvalId, decision } = body as {
    approvalId?: string;
    decision?: "approved" | "rejected";
  };

  if (!approvalId || !decision) {
    return NextResponse.json({ error: "approvalId et decision requis" }, { status: 400 });
  }

  const result = await decideApproval(approvalId, user.id, decision);
  if (!result || result.runId !== params.runId) {
    return NextResponse.json({ error: "Approbation introuvable ou déjà traitée" }, { status: 404 });
  }

  if (decision === "approved") {
    const { processPendingAgentRuns } = await import("@/lib/worker/process-pending-runs");
    void processPendingAgentRuns(1).catch((e) =>
      console.error("[approve] worker kick failed", e)
    );
  }

  return NextResponse.json({ ok: true, runId: result.runId, resumeFromStep: result.stepIndex + 1 });
}
