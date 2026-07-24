import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(_request: NextRequest, props: { params: Promise<{ runId: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const admin = createAdminClient();
  const runId = params.runId;

  const { data: run } = await admin
    .from("listing_agent_runs")
    .select("id, user_id, status, used_credits, credit_hold_estimate_cents")
    .eq("id", runId)
    .single();

  if (!run) {
    return NextResponse.json({ error: "Run introuvable" }, { status: 404 });
  }

  const isOwner = run.user_id === user.id;
  if (!isOwner) {
    const { data: profile } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    if (!profile?.is_admin) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
  }

  const TERMINAL = ["completed", "failed", "cancelled"];
  if (TERMINAL.includes(run.status)) {
    return NextResponse.json({ status: run.status, message: "Run déjà terminé." });
  }

  // Pas encore démarré OU en pause d'approbation (rien ne s'exécute) →
  // annulation immédiate. Seul un run réellement en cours passe par
  // l'annulation coopérative (arrêt à la prochaine étape).
  const immediate =
    run.status === "pending" || run.status === "queued" || run.status === "awaiting_approval";

  // Garde anti-course : le worker a pu claim le run entre notre lecture et
  // ici. On n'annule « immédiat » (avec libération du hold) que si le statut
  // n'a pas bougé — sinon le hold serait libéré DEUX fois (ici + worker),
  // effaçant les holds des autres runs en cours. À défaut, on retombe sur
  // l'annulation coopérative.
  let cancelledNow = false;
  if (immediate) {
    const { data: updated } = await admin
      .from("listing_agent_runs")
      .update({
        cancel_requested: true,
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .eq("status", run.status)
      .select("id");
    cancelledNow = Boolean(updated?.length);
  }
  if (!cancelledNow) {
    await admin.from("listing_agent_runs").update({ cancel_requested: true }).eq("id", runId);
  }

  if (cancelledNow) {
    // Libère le hold de crédits (sinon il reste posé à vie — le reaper ne
    // repasse pas sur un run cancelled).
    if (run.used_credits && run.credit_hold_estimate_cents != null) {
      const { releaseAgentRunCredits } = await import("@/lib/billing/agent-run-billing");
      await releaseAgentRunCredits(
        run.user_id,
        run.id,
        Number(run.credit_hold_estimate_cents),
      ).catch((e) => console.error("[cancel] release hold failed", e));
    }
    // Clôt les approbations en attente du run (sinon elles restent dans la
    // file Validations pour un run déjà annulé).
    await admin
      .from("agent_approvals")
      .update({ status: "rejected", decided_at: new Date().toISOString() })
      .eq("run_id", runId)
      .eq("status", "pending");
  }

  return NextResponse.json({
    status: cancelledNow ? "cancelled" : "cancelling",
    message: cancelledNow
      ? "Run annulé."
      : "Arrêt demandé — l'agent s'arrêtera à la prochaine étape.",
  });
}
