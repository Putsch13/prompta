import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { diagnoseFailedSteps, type FailedStepInfo } from "@/lib/agent/diagnose-run";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(
  _request: NextRequest,
  { params }: { params: { runId: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const admin = createAdminClient();
  const runId = params.runId;

  const { data: run } = await (admin as any)
    .from("listing_agent_runs")
    .select("id, user_id, listing_id, version_id, inputs, status, error_message")
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

  const { data: steps } = await (admin as any)
    .from("listing_agent_run_steps")
    .select("step_index, label, status, error_code, error_message, action_slug, tool_slug, error_detail")
    .eq("run_id", runId)
    .eq("status", "failed")
    .order("step_index", { ascending: true });

  const failed: FailedStepInfo[] = (steps ?? []).map((s: any) => ({
    stepIndex: s.step_index,
    label: s.label,
    errorCode: s.error_code,
    errorMessage: s.error_message,
    actionSlug: s.action_slug,
    toolSlug: s.tool_slug,
    connector: (s.error_detail && (s.error_detail.connector as string)) || null,
  }));

  const { fixes, summary } = diagnoseFailedSteps(failed);

  // Liens d'auth pour les correctifs de connexion (returnUrl = page détail run).
  const returnUrl = `/dashboard/runs/${runId}`;
  const enrichedFixes = fixes.map((f) => {
    if ((f.kind === "connect" || f.kind === "reconnect") && f.connector) {
      const force = f.kind === "reconnect" ? "&force=true" : "";
      return {
        ...f,
        connectUrl: `/api/connectors/${encodeURIComponent(
          f.connector,
        )}/connect?returnUrl=${encodeURIComponent(returnUrl)}${force}`,
      };
    }
    return f;
  });

  return NextResponse.json({
    summary,
    fixes: enrichedFixes,
    canRelaunch: Boolean(run.listing_id && run.version_id),
    relaunch: {
      listingId: run.listing_id ?? null,
      versionId: run.version_id ?? null,
      inputs: (run.inputs ?? {}) as Record<string, string>,
    },
    status: run.status,
  });
}
