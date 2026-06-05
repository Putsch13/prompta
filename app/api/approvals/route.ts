import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listPendingApprovals } from "@/lib/agent/approvals";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const pending = await listPendingApprovals(user.id);
  const admin = createAdminClient();

  type ApprovalRow = Awaited<ReturnType<typeof listPendingApprovals>>[number];

  const listingIds = Array.from(
    new Set(
      pending
        .map((a: ApprovalRow) => (a.listing_agent_runs as { listing_id?: string } | null)?.listing_id)
        .filter(Boolean) as string[],
    ),
  );

  let listings: Record<string, { title: string; slug: string }> = {};
  if (listingIds.length > 0) {
    const { data } = await admin.from("listings").select("id, title, slug").in("id", listingIds);
    listings = Object.fromEntries((data ?? []).map((l) => [l.id, { title: l.title, slug: l.slug }]));
  }

  const items = pending.map((a: ApprovalRow) => {
    const run = a.listing_agent_runs as { id: string; listing_id: string } | null;
    const listing = run?.listing_id ? listings[run.listing_id] : null;
    return {
      id: a.id,
      runId: a.run_id,
      stepIndex: a.step_index,
      payload: a.payload,
      expiresAt: a.expires_at,
      createdAt: a.created_at,
      agentTitle: listing?.title ?? "Agent",
      agentSlug: listing?.slug,
    };
  });

  return NextResponse.json({ items, count: items.length });
}
