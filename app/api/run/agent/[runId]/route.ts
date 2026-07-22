import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { plannedStepLabels } from "@/lib/agent/step-label";
import { parseListingEnv } from "@/lib/agent/env";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ runId: string }>;
}

export async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: run } = await supabase
    .from("listing_agent_runs")
    .select("id, status, output, error_message, steps_completed, created_at, started_at, heartbeat_at, claimed_by, version_id, inputs")
    .eq("id", params.runId)
    .eq("user_id", user.id)
    .single() as { data: { id: string; status: string; output: unknown; error_message: string | null; steps_completed: number | null; created_at: string; started_at: string | null; heartbeat_at: string | null; claimed_by: string | null; version_id: string | null; inputs: Record<string, string> | null } | null };

  if (!run) {
    return NextResponse.json({ error: "Run non trouvé" }, { status: 404 });
  }

  // Étapes prévues (libellés lisibles pour la console live, avant les logs) —
  // depuis la version publiée, ou le manifeste embarqué d'un run de test.
  let planned_steps: string[] = [];
  try {
    if (run.version_id) {
      const admin = createAdminClient();
      const { data: version } = await admin
        .from("listing_versions")
        .select("env, prompt_body")
        .eq("id", run.version_id)
        .single();
      const parsed = parseListingEnv(version?.env, version?.prompt_body);
      if (parsed?.manifest?.steps) planned_steps = plannedStepLabels(parsed.manifest.steps);
    } else if (typeof run.inputs?.__manifest === "string") {
      const manifest = JSON.parse(run.inputs.__manifest) as { steps?: unknown[] };
      if (Array.isArray(manifest.steps)) {
        planned_steps = plannedStepLabels(manifest.steps as Parameters<typeof plannedStepLabels>[0]);
      }
    }
  } catch {
    // best-effort — la console retombe sur « Étape N »
  }

  // La pause d'approbation est dérivée de la ligne agent_approvals (source de
  // vérité) — pas seulement du statut du run : si la contrainte de statut de
  // la prod est en retard (drift 0045), le run reste « running » en base mais
  // il EST en attente de validation.
  let approval_id: string | null = null;
  let approval: {
    id: string;
    label?: string;
    preview?: string;
    step_index: number;
  } | null = null;
  let browser_task: { id: string; request: unknown } | null = null;
  let effectiveStatus = run.status;
  if (["awaiting_approval", "running", "pending"].includes(run.status)) {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pending } = await admin
      .from("agent_approvals")
      .select("id, payload, step_index")
      .eq("run_id", params.runId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pending) {
      approval_id = pending.id;
      const payload = (pending.payload ?? {}) as { label?: string; preview?: string; full?: string };
      approval = {
        id: pending.id,
        label: payload.label,
        // La modale édite le contenu INTÉGRAL (sinon approuver avec
        // modification re-tronquait à la préview).
        preview: payload.full ?? payload.preview,
        step_index: pending.step_index ?? 0,
      };
      effectiveStatus = "awaiting_approval";
    }

    // Pilotage navigateur en attente : l'extension qui polle ce statut exécute
    // la tâche dans l'onglet de l'utilisateur puis poste sa réponse.
    if (run.status === "running") {
      const { data: task } = await admin
        .from("agent_browser_tasks")
        .select("id, request")
        .eq("run_id", params.runId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (task) browser_task = { id: task.id, request: task.request };
    }
  }

  // Journal d'activité live : les dernières étapes (label + statut + aperçu)
  // pour un rapport « au fur et à mesure » dans le panneau (le fil des actions
  // de l'agent, pas juste « en cours »).
  let activity: Array<{ label: string; status: string; preview?: string; index: number }> = [];
  {
    const activityDb = createAdminClient();
    const { data: steps } = await activityDb
      .from("listing_agent_run_steps")
      .select("step_index, label, status, output_preview, input_preview")
      .eq("run_id", params.runId)
      .order("step_index", { ascending: true })
      .limit(40);
    const asText = (v: unknown): string =>
      typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
    activity = (steps ?? []).map((s) => ({
      index: Number(s.step_index ?? 0),
      label: (s.label as string) || `Étape ${Number(s.step_index ?? 0) + 1}`,
      status: (s.status as string) || "running",
      preview: (asText(s.output_preview) || asText(s.input_preview)).slice(0, 220) || undefined,
    }));
  }

  return NextResponse.json({
    id: run.id,
    status: effectiveStatus,
    output: run.output,
    error_message: run.error_message,
    steps_completed: run.steps_completed,
    created_at: run.created_at,
    started_at: run.started_at ?? null,
    heartbeat_at: run.heartbeat_at ?? null,
    approval_id,
    approval,
    browser_task,
    planned_steps,
    activity,
  });
}
