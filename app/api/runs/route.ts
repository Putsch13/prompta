import { NextRequest, NextResponse } from "next/server";
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

/** Taille de page de l'historique (par source ET après fusion). */
const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Pagination par curseur : ?before=<created_at ISO> charge la page PLUS
  // ANCIENNE que ce timestamp. Sans curseur = première page (la plus récente).
  const beforeRaw = request.nextUrl.searchParams.get("before");
  const before = beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? beforeRaw : null;

  const admin = createAdminClient();

  let promptQuery = supabase
    .from("runs")
    .select(
      "id, status, model, output, error_message, cost_estimate, created_at, listing_id, version_id, listing:listings(title, slug)"
    )
    .eq("user_id", user.id);
  let agentQuery = admin
    .from("listing_agent_runs")
    .select(
      "id, status, steps_completed, output, error_message, created_at, listing_id, version_id, inputs, listing:listings(title, slug)"
    )
    .eq("user_id", user.id);
  if (before) {
    promptQuery = promptQuery.lt("created_at", before);
    agentQuery = agentQuery.lt("created_at", before);
  }

  const [{ data: promptRuns }, { data: agentRuns }, { data: savedListings }] = await Promise.all([
    promptQuery.order("created_at", { ascending: false }).limit(PAGE_SIZE),
    agentQuery.order("created_at", { ascending: false }).limit(PAGE_SIZE),
    // Agents GARDÉS (bibliothèque) : listings créés par l'utilisateur depuis
    // l'extension — relançables même sans run récent. Première page seulement.
    before
      ? Promise.resolve({ data: null })
      : admin
          .from("listings")
          .select("id, title, description, current_version_id, created_at")
          .eq("creator_id", user.id)
          .eq("type", "agent")
          .neq("status", "deleted")
          .order("created_at", { ascending: false })
          .limit(50),
  ]);

  const savedAgents = (savedListings ?? [])
    .filter((l) => l.current_version_id)
    .map((l) => ({
      id: l.id as string,
      title: (l.title as string) || "Agent",
      // L'ordre d'origine (« Créé depuis Prompta partout — ordre : … ») :
      // c'est CE texte qui dit à l'utilisateur ce que fait l'agent.
      description: ((l.description as string | null) ?? "").replace(/^Créé depuis Prompta partout — ordre d'origine : /, ""),
      versionId: l.current_version_id as string,
      createdAt: l.created_at as string,
    }));

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

  const page = merged.slice(0, PAGE_SIZE);
  // Il reste de l'historique si la fusion déborde la page, ou si une source a
  // rempli sa propre limite (elle peut avoir des lignes plus anciennes même si
  // la fusion tient dans la page).
  const hasMore =
    merged.length > PAGE_SIZE ||
    (promptRuns?.length ?? 0) === PAGE_SIZE ||
    (agentRuns?.length ?? 0) === PAGE_SIZE;
  const nextCursor = hasMore && page.length > 0 ? page[page.length - 1].created_at : null;

  return NextResponse.json({ runs: page, savedAgents, hasMore, nextCursor });
}
