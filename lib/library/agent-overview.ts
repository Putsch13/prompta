import { createAdminClient } from "@/lib/supabase/admin";

export interface AgentOverview {
  id: string;
  title: string;
  slug: string;
  type: string;
  status: string | null;
  updated_at: string;
  lastRun: {
    id: string;
    status: string;
    created_at: string;
    deliverables: number;
  } | null;
  runCount: number;
}

/**
 * Vue cycle de vie des agents de l'utilisateur : statut de production,
 * dernier run (avec nombre de livrables) et volume d'exécutions.
 */
export async function fetchAgentsOverview(userId: string): Promise<AgentOverview[]> {
  const admin = createAdminClient();

  const { data: listings } = await admin
    .from("listings")
    .select("id, title, slug, type, status, updated_at")
    .eq("creator_id", userId)
    .neq("type", "prompt")
    .neq("status", "deleted")
    .order("updated_at", { ascending: false });

  const agents = (listings ?? []) as Array<{
    id: string;
    title: string;
    slug: string;
    type: string;
    status: string | null;
    updated_at: string;
  }>;
  if (agents.length === 0) return [];

  const ids = agents.map((a) => a.id);

  // Derniers runs (une passe, groupés côté JS).
  const { data: runs } = await admin
    .from("listing_agent_runs")
    .select("id, listing_id, status, created_at")
    .in("listing_id", ids)
    .order("created_at", { ascending: false })
    .limit(400);

  const lastByListing = new Map<string, { id: string; status: string; created_at: string }>();
  const countByListing = new Map<string, number>();
  for (const r of runs ?? []) {
    if (!r.listing_id) continue;
    countByListing.set(r.listing_id, (countByListing.get(r.listing_id) ?? 0) + 1);
    if (!lastByListing.has(r.listing_id)) {
      lastByListing.set(r.listing_id, {
        id: r.id,
        status: r.status,
        created_at: r.created_at ?? new Date().toISOString(),
      });
    }
  }

  // Livrables des derniers runs (une requête pour tous).
  const lastRunIds = Array.from(lastByListing.values()).map((r) => r.id);
  const deliverablesByRun = new Map<string, number>();
  if (lastRunIds.length > 0) {
    const { data: deliverables } = await admin
      .from("agent_deliverables")
      .select("run_id")
      .in("run_id", lastRunIds);
    for (const d of deliverables ?? []) {
      deliverablesByRun.set(d.run_id, (deliverablesByRun.get(d.run_id) ?? 0) + 1);
    }
  }

  return agents.map((a) => {
    const last = lastByListing.get(a.id) ?? null;
    return {
      ...a,
      lastRun: last
        ? { ...last, deliverables: deliverablesByRun.get(last.id) ?? 0 }
        : null,
      runCount: countByListing.get(a.id) ?? 0,
    };
  });
}
