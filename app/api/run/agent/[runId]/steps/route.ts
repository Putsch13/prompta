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

  if (!run) {
    return NextResponse.json({ error: "Run introuvable" }, { status: 404 });
  }

  const isOwner = run.user_id === user.id;
  const { data: profile } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!isOwner && !profile?.is_admin) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { data: steps } = await admin
    .from("listing_agent_run_steps")
    .select("*")
    .eq("run_id", runId)
    .order("step_index", { ascending: true });

  const safeSteps = (steps ?? []).map((s: any) => ({
    id: s.id,
    stepIndex: s.step_index,
    stepId: s.step_id,
    stepType: s.step_type,
    label: s.label,
    status: s.status,
    startedAt: s.started_at,
    finishedAt: s.finished_at,
    durationMs: s.duration_ms,
    inputPreview: s.input_preview,
    outputPreview: s.output_preview,
    errorCode: s.error_code,
    errorMessage: isOwner && !profile?.is_admin
      ? sanitizeErrorForUser(s.error_message, s.error_code)
      : s.error_message,
    errorDetail: s.error_detail ?? null,
    provider: s.provider,
    model: s.model,
    toolSlug: s.tool_slug,
    actionSlug: s.action_slug,
    usage: s.usage,
  }));

  return NextResponse.json({ steps: safeSteps });
}

function sanitizeErrorForUser(message: string | null, code: string | null): string | null {
  if (!message) return null;
  if (message.includes("x-api-key") || message.includes("Bearer")) {
    return `Erreur provider (${code ?? "unknown"}) — contactez le support si le problème persiste`;
  }
  return message.slice(0, 500);
}
