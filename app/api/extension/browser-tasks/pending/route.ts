import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Tâches de pilotage navigateur EN ATTENTE pour l'utilisateur connecté.
 *
 * Filet de sécurité de l'extension : un run à étape « browser » lancé hors du
 * panneau (relance dashboard, réparation automatique, reprise worker) n'avait
 * AUCUN exécuteur — la tâche expirait après 60 s en « le navigateur n'a pas
 * répondu ». Le service worker scanne cette route via son alarme périodique
 * et adopte les tâches orphelines.
 *
 * Fenêtre courte (90 s) : une tâche plus vieille est déjà expirée côté
 * orchestrateur (TASK_TIMEOUT_MS 60 s) — inutile de la faire exécuter.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const admin = createAdminClient();
  const { data: runs } = await admin
    .from("listing_agent_runs")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "running")
    .order("created_at", { ascending: false })
    .limit(5);
  const runIds = (runs ?? []).map((r) => r.id);
  if (!runIds.length) return NextResponse.json({ tasks: [] });

  const since = new Date(Date.now() - 90_000).toISOString();
  const { data: tasks } = await admin
    .from("agent_browser_tasks")
    .select("id, run_id, request, created_at")
    .in("run_id", runIds)
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(10);

  return NextResponse.json({
    tasks: (tasks ?? []).map((t) => ({ id: t.id, runId: t.run_id, request: t.request })),
  });
}
