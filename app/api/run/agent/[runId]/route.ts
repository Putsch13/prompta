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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: run } = await (supabase as any)
    .from("listing_agent_runs")
    .select("id, status, output, error_message, steps_completed, created_at, started_at, heartbeat_at, claimed_by")
    .eq("id", params.runId)
    .eq("user_id", user.id)
    .single() as { data: { id: string; status: string; output: unknown; error_message: string | null; steps_completed: number | null; created_at: string; started_at: string | null; heartbeat_at: string | null; claimed_by: string | null } | null };

  if (!run) {
    return NextResponse.json({ error: "Run non trouvé" }, { status: 404 });
  }

  let approval_id: string | null = null;
  let approval: {
    id: string;
    label?: string;
    preview?: string;
    step_index: number;
  } | null = null;
  if (run.status === "awaiting_approval") {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pending } = await (admin as any)
      .from("agent_approvals")
      .select("id, payload, step_index")
      .eq("run_id", params.runId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pending) {
      approval_id = pending.id;
      const payload = (pending.payload ?? {}) as { label?: string; preview?: string };
      approval = {
        id: pending.id,
        label: payload.label,
        preview: payload.preview,
        step_index: pending.step_index,
      };
    }
  }

  return NextResponse.json({
    id: run.id,
    status: run.status,
    output: run.output,
    error_message: run.error_message,
    steps_completed: run.steps_completed,
    created_at: run.created_at,
    started_at: run.started_at ?? null,
    heartbeat_at: run.heartbeat_at ?? null,
    approval_id,
    approval,
  });
}
