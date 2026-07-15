import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBuilderApiKey } from "@/lib/builder/api-key";
import { builderRateLimit } from "@/lib/builder/rate-limit";
import { listUserConnections } from "@/lib/connections";
import { buildInstantAgent, sanitizeUrlForContext, type PageContext } from "@/lib/extension/instant-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Extension « Prompta Everywhere » : ordre en langage naturel + contexte de la
 * page courante → manifeste instantané → run lancé immédiatement (worker,
 * console live, validations humaines : le circuit standard).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json(
      { error: "not_authenticated", message: "Connectez-vous à Prompta dans cet onglet de navigateur, puis réessayez." },
      { status: 401 },
    );
  }

  const limited = await builderRateLimit(user.id);
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as {
    goal?: string;
    page?: PageContext;
    modelId?: string;
  } | null;

  const goal = body?.goal?.trim();
  if (!goal || goal.length < 5) {
    return NextResponse.json({ error: "invalid_goal", message: "Décrivez ce que l'agent doit faire (5 caractères minimum)." }, { status: 400 });
  }
  // La page est optionnelle : une mission mobile « sans page » (juste un ordre)
  // est légitime. On normalise vers un contexte vide plutôt que de rejeter.
  const page = body?.page ?? { url: "" };

  const keyResult = await getBuilderApiKey(user.id, body?.modelId ?? "gpt-5.4-mini");
  if (!keyResult.ok) {
    return NextResponse.json({ error: "no_api_key", message: keyResult.error }, { status: 503 });
  }

  const connections = await listUserConnections(user.id);
  const usable = new Set(connections.filter((c) => c.usable).map((c) => c.connectorId));

  let built;
  try {
    built = await buildInstantAgent({
      goal,
      page,
      userEmail: user.email,
      apiKey: keyResult.apiKey,
      resolved: keyResult.resolved,
      usableConnectors: usable,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "plan_failed", message: err instanceof Error ? err.message : "Génération du plan impossible." },
      { status: 422 },
    );
  }

  // Connecteur requis non connecté → on ne crée PAS de run mort-né (le worker
  // le ferait échouer d'emblée). On renvoie la liste pour que l'extension
  // propose de connecter l'app, sans consommer de run.
  if (built.missingConnectors.length > 0) {
    return NextResponse.json(
      {
        error: "missing_connectors",
        message: `Connectez d'abord : ${built.missingConnectors.join(", ")}.`,
        missingConnectors: built.missingConnectors,
        title: built.title,
      },
      { status: 409 },
    );
  }

  const admin = createAdminClient();
  const { data: run, error: insertError } = await admin
    .from("listing_agent_runs")
    .insert({
      user_id: user.id,
      listing_id: null,
      status: "pending",
      dry_run: false,
      inputs: {
        __manifest: JSON.stringify(built.manifest),
        __source: "extension",
        __source_url: sanitizeUrlForContext(page.url ?? "").slice(0, 500),
        // Historique conversationnel : l'ordre et le modèle choisis (l'objectif
        // est saisi par l'utilisateur → pas de secret à filtrer).
        __goal: goal.slice(0, 500),
        __model: keyResult.resolved.catalogId,
        __title: built.title.slice(0, 120),
      },
    })
    .select("id")
    .single();

  if (insertError || !run?.id) {
    return NextResponse.json(
      { error: "run_insert_failed", message: insertError?.message ?? "Impossible de créer le run." },
      { status: 500 },
    );
  }

  // Détaché de la requête : l'abort du proxy ne doit pas tuer le run.
  after(async () => {
    const { processPendingAgentRuns } = await import("@/lib/worker/process-pending-runs");
    await processPendingAgentRuns(1, { runId: run.id }).catch((err) =>
      console.error("[extension/execute] queue failed:", err instanceof Error ? err.message : err),
    );
  });

  return NextResponse.json({
    runId: run.id,
    title: built.title,
    stepsPlanned: built.manifest.steps.length,
    runUrl: `/dashboard/runs/${run.id}`,
  });
}
