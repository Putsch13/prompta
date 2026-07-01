import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(_request: NextRequest, props: { params: Promise<{ runId: string }> }) {
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
    .select("id, user_id")
    .eq("id", runId)
    .single();

  if (!run || run.user_id !== user.id) {
    return NextResponse.json({ error: "Run introuvable" }, { status: 404 });
  }

  const { data: deliverables } = await admin
    .from("agent_deliverables")
    .select("id, kind, filename, mime_type, preview_text, size_bytes, created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  return NextResponse.json({ deliverables: deliverables ?? [] });
}
