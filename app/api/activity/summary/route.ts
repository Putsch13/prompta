import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Synthèse d'activité légère pour la nav (badges live) :
 * agents en cours d'exécution + validations en attente.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const admin = createAdminClient();

  const [{ count: activeRuns }, { count: pendingApprovals }] = await Promise.all([
    admin
      .from("listing_agent_runs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("status", ["pending", "queued", "running"]),
    admin
      .from("agent_approvals")
      .select("*, listing_agent_runs!inner(user_id)", { count: "exact", head: true })
      .eq("listing_agent_runs.user_id", user.id)
      .eq("status", "pending"),
  ]);

  return NextResponse.json({
    activeRuns: activeRuns ?? 0,
    pendingApprovals: pendingApprovals ?? 0,
  });
}
