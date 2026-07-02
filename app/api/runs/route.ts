import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type PromptRun = {
  id: string;
  status: string;
  model: string | null;
  output: string | null;
  error_message: string | null;
  cost_estimate: number | null;
  created_at: string;
  listing_id: string | null;
  version_id: string | null;
  listing: { title: string; slug: string } | null;
};

type AgentRun = {
  id: string;
  status: string;
  steps_completed: number | null;
  output: Record<string, string> | null;
  error_message: string | null;
  created_at: string;
  listing_id: string | null;
  version_id: string | null;
  inputs: Record<string, string> | null;
  listing: { title: string; slug: string } | null;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const admin = createAdminClient();

  const [{ data: promptRuns }, { data: agentRuns }] = await Promise.all([
    supabase
      .from("runs")
      .select(
        "id, status, model, output, error_message, cost_estimate, created_at, listing_id, version_id, listing:listings(title, slug)"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("listing_agent_runs")
      .select(
        "id, status, steps_completed, output, error_message, created_at, listing_id, version_id, inputs, listing:listings(title, slug)"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  // Dérive « en attente de validation » depuis agent_approvals (source de
  // vérité) — le statut du run peut être resté « running » si la contrainte
  // de statut de la prod est en retard (drift 0045).
  const agentRunIds = (agentRuns ?? []).map((r) => r.id);
  const awaitingIds = new Set<string>();
  if (agentRunIds.length > 0) {
    const { data: pendingApprovals } = await admin
      .from("agent_approvals")
      .select("run_id")
      .in("run_id", agentRunIds)
      .eq("status", "pending");
    for (const a of pendingApprovals ?? []) awaitingIds.add(a.run_id);
  }

  const merged = [
    ...((promptRuns ?? []) as PromptRun[]).map((r) => ({
      ...r,
      kind: "prompt" as const,
    })),
    ...((agentRuns ?? []) as AgentRun[]).map((r) => ({
      id: r.id,
      status: awaitingIds.has(r.id) && ["running", "pending", "awaiting_approval"].includes(r.status)
        ? "awaiting_approval"
        : r.status,
      model: `agent (${r.steps_completed ?? 0} étapes)`,
      output: r.output?.result ?? (r.output ? JSON.stringify(r.output, null, 2) : null),
      error_message: r.error_message,
      cost_estimate: null,
      created_at: r.created_at,
      listing_id: r.listing_id,
      version_id: r.version_id,
      // Les clés techniques (__manifest…) ne sortent pas de l'API (poids +
      // elles ne sont pas des entrées d'agent à réutiliser au retry).
      inputs: r.inputs
        ? Object.fromEntries(Object.entries(r.inputs).filter(([k]) => !k.startsWith("__")))
        : null,
      listing: r.listing,
      kind: "agent" as const,
    })),
  ].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return NextResponse.json({ runs: merged.slice(0, 50) });
}
