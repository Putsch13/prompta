import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { plannedStepLabels, stepThought } from "@/lib/agent/step-label";
import { parseListingEnv } from "@/lib/agent/env";
import { AgentManifestSchema } from "@/lib/agent/schema";
import { ensureApprovalGuards, hasApprovalGuardStamp } from "@/lib/agent/approval-guards";

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
  // Run tamponné __guarded : l'exécution utilise le manifeste GARDÉ — on
  // re-garde le manifeste relu (déterministe) pour que la liste affichée
  // corresponde aux index réellement exécutés (approbations insérées incluses).
  let planned_steps: string[] = [];
  try {
    const stamped = hasApprovalGuardStamp(run.inputs);
    if (run.version_id) {
      const admin = createAdminClient();
      const { data: version } = await admin
        .from("listing_versions")
        .select("env, prompt_body")
        .eq("id", run.version_id)
        .single();
      const parsed = parseListingEnv(version?.env, version?.prompt_body);
      if (parsed?.manifest?.steps) {
        const manifest = stamped ? ensureApprovalGuards(parsed.manifest) : parsed.manifest;
        planned_steps = plannedStepLabels(manifest.steps);
      }
    } else if (typeof run.inputs?.__manifest === "string") {
      const manifest = JSON.parse(run.inputs.__manifest) as { steps?: unknown[] };
      let steps = manifest.steps;
      if (stamped) {
        const reparsed = AgentManifestSchema.safeParse(manifest);
        if (reparsed.success) steps = ensureApprovalGuards(reparsed.data).steps;
      }
      if (Array.isArray(steps)) {
        planned_steps = plannedStepLabels(steps as Parameters<typeof plannedStepLabels>[0]);
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

  // Journal d'activité live : les dernières étapes (label + statut + aperçu +
  // RÉFLEXION à la première personne) pour un rapport « au fur et à mesure »
  // dans le panneau — l'agent pense à voix haute sur TOUTES les étapes, pas
  // seulement pendant le pilotage navigateur.
  let activity: Array<{ label: string; status: string; preview?: string; thought?: string; index: number }> = [];
  {
    const activityDb = createAdminClient();
    const { data: steps } = await activityDb
      .from("listing_agent_run_steps")
      .select("step_index, step_type, label, status, output_preview, input_preview, tool_slug, action_slug, model")
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
      thought: stepThought(s),
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
