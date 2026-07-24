import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decideApproval } from "@/lib/agent/approvals";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, props: { params: Promise<{ runId: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
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
  const { approvalId, decision, modifiedContent } = body as {
    approvalId?: string;
    decision?: "approved" | "rejected";
    modifiedContent?: string;
  };

  if (!approvalId || !decision) {
    return NextResponse.json({ error: "approvalId et decision requis" }, { status: 400 });
  }

  // decideApproval throw (ex. réponse vide à une étape « question ») : 400
  // avec le message FR — pas un 500 générique que le front avale en silence.
  let result;
  try {
    result = await decideApproval(approvalId, user.id, decision, {
      modifiedContent: decision === "approved" ? modifiedContent : undefined,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Décision impossible" },
      { status: 400 },
    );
  }
  if (!result && decision === "approved") {
    return NextResponse.json({ error: "Approbation introuvable ou déjà traitée" }, { status: 404 });
  }
  if (decision === "rejected") {
    return NextResponse.json({ ok: true, rejected: true });
  }
  if (!result || result.runId !== params.runId) {
    return NextResponse.json({ error: "Approbation introuvable ou déjà traitée" }, { status: 404 });
  }

  if (decision === "approved") {
    // Kick ciblé, détaché de la requête via after() (sinon l'abort du proxy
    // peut tuer la reprise en plein vol).
    const resumedRunId = result.runId;
    after(async () => {
      const { processPendingAgentRuns } = await import("@/lib/worker/process-pending-runs");
      await processPendingAgentRuns(1, { runId: resumedRunId }).catch((e) =>
        console.error("[approve] worker kick failed", e)
      );
    });
  }

  return NextResponse.json({ ok: true, runId: result.runId, resumeFromStep: result.stepIndex + 1 });
}
