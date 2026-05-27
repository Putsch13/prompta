import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface Params {
  params: { runId: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { data: run } = await supabase
    .from("listing_agent_runs")
    .select("id, status, output, error_message, steps_completed, created_at")
    .eq("id", params.runId)
    .eq("user_id", user.id)
    .single();

  if (!run) {
    return NextResponse.json({ error: "Run non trouvé" }, { status: 404 });
  }

  let approval_id: string | null = null;
  if (run.status === "awaiting_approval") {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: approval } = await (admin as any)
      .from("agent_approvals")
      .select("id")
      .eq("run_id", params.runId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    approval_id = approval?.id ?? null;
  }

  return NextResponse.json({
    id: run.id,
    status: run.status,
    output: run.output,
    error_message: run.error_message,
    steps_completed: run.steps_completed,
    created_at: run.created_at,
    approval_id,
  });
}
