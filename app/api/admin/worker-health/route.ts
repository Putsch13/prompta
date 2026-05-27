import { NextResponse } from "next/server";
import { getAdminOrNull } from "@/lib/admin/guard";
import { getRunHealthStats } from "@/lib/worker/reap-stale-runs";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAdminOrNull();
  if (!admin) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const stats = await getRunHealthStats();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: recentRuns } = await db
    .from("listing_agent_runs")
    .select(`
      id, status, steps_completed, created_at, started_at, heartbeat_at,
      claimed_by, error_message,
      listing:listings(title),
      user:profiles!listing_agent_runs_user_id_fkey(username)
    `)
    .order("created_at", { ascending: false })
    .limit(30);

  const mapped = (recentRuns ?? []).map((r: Record<string, unknown>) => ({
    id: r.id,
    status: r.status,
    listing_title: (r.listing as { title: string } | null)?.title ?? null,
    user_email: (r.user as { username: string } | null)?.username ?? null,
    created_at: r.created_at,
    started_at: r.started_at ?? null,
    heartbeat_at: r.heartbeat_at ?? null,
    claimed_by: r.claimed_by ?? null,
    steps_completed: r.steps_completed ?? 0,
    error_message: r.error_message ?? null,
  }));

  return NextResponse.json({
    ...stats,
    recentRuns: mapped,
  });
}
