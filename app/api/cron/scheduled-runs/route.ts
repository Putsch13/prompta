import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get("x-cron-secret");
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();

  const { data: dueRuns } = await admin
    .from("scheduled_runs")
    .select("id, user_id, listing_id, inputs, notify_email")
    .eq("active", true)
    .lte("next_run_at", now.toISOString());

  let processed = 0;

  for (const run of dueRuns ?? []) {
    const { data: listing } = await admin
      .from("listings")
      .select("current_version_id")
      .eq("id", run.listing_id)
      .single();

    if (!listing?.current_version_id) continue;

    await admin.from("listing_agent_runs").insert({
      user_id: run.user_id,
      listing_id: run.listing_id,
      version_id: listing.current_version_id,
      inputs: (run.inputs as Record<string, string>) ?? {},
      status: "pending",
    });

    const nextRun = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await admin
      .from("scheduled_runs")
      .update({ last_run_at: now.toISOString(), next_run_at: nextRun.toISOString() })
      .eq("id", run.id);

    processed++;
  }

  return NextResponse.json({ processed });
}
