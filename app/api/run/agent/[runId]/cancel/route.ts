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
    .select("id, user_id, status")
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

  // Si pas encore démarré → annulation immédiate ; sinon annulation coopérative.
  const notStarted = run.status === "pending" || run.status === "queued";
  const update: { cancel_requested: boolean; status?: string; cancelled_at?: string } = {
    cancel_requested: true,
  };
  if (notStarted) {
    update.status = "cancelled";
    update.cancelled_at = new Date().toISOString();
  }

  await admin.from("listing_agent_runs").update(update).eq("id", runId);

  return NextResponse.json({
    status: notStarted ? "cancelled" : "cancelling",
    message: notStarted ? "Run annulé." : "Arrêt demandé — l'agent s'arrêtera à la prochaine étape.",
  });
}
