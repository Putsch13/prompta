import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBuilderApiKey } from "@/lib/builder/api-key";
import { builderRateLimit } from "@/lib/builder/rate-limit";
import { listUserConnections } from "@/lib/connections";
import { buildInstantAgent, sanitizeUrlForContext, type PageContext } from "@/lib/extension/instant-agent";
import { getAvailableBalance, debitPlatformUsage, CREDIT_VALUE_CENTS } from "@/lib/credits";
import { getCreditCircuitStatus } from "@/lib/billing/circuit-breaker";
import { getModelPricing } from "@/lib/llm/pricing";

export const dynamic = "force-dynamic";
// Le run tourne dans after() : une mission avec pilotage navigateur (dialogue
// homme-machine) a un plancher orchestrateur de 10 min — on s'aligne dessus.
export const maxDuration = 600;

/** Estimation (cents) du coût de l'appel de planification — ~4 car./token. */
function estimatePlanningCostCents(
  apiModel: string,
  goal: string,
  page: PageContext,
  outputChars: number,
): number {
  const pricing = getModelPricing(apiModel);
  const inputChars =
    4_000 + // prompt système + instructions
    goal.length +
    Math.min(page.content?.length ?? 0, 12_000) +
    1_200 * Math.min(page.openTabs?.length ?? 0, 30);
  const inTok = Math.ceil(inputChars / 4);
  const outTok = Math.ceil(Math.max(outputChars, 200) / 4);
  return (inTok * pricing.inputPer1M + outTok * pricing.outputPer1M) / 1_000_000;
}

/**
 * Extension « Prompta partout » : ordre en langage naturel + contexte de la
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
    /** Derniers échanges (continuité conversationnelle), plus récent en dernier. */
    history?: { role: "user" | "assistant"; content: string }[];
  } | null;

  const history = (body?.history ?? [])
    .filter(
      (m) =>
        (m?.role === "user" || m?.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim(),
    )
    .slice(-8)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

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

  // ── Garde-fous crédits AVANT de payer la planification (clé plateforme) ──
  const onPlatformKey = keyResult.source === "platform";
  if (onPlatformKey) {
    const circuit = await getCreditCircuitStatus().catch(() => null);
    if (circuit && !circuit.allowed) {
      return NextResponse.json(
        {
          error: "credits_paused",
          message: "Les runs en crédits sont en pause (protection plateforme). Utilise ta propre clé API (BYOK) ou réessaie plus tard.",
        },
        { status: 503 },
      );
    }
    const available = await getAvailableBalance(user.id);
    if (available < CREDIT_VALUE_CENTS) {
      return NextResponse.json(
        {
          error: "no_credits",
          message: "Crédits IA épuisés — recharge dans Dashboard → Crédits, ou ajoute ta propre clé API (BYOK, illimité).",
        },
        { status: 402 },
      );
    }
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
      history,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "plan_failed", message: err instanceof Error ? err.message : "Génération du plan impossible." },
      { status: 422 },
    );
  }

  // La planification a coûté un appel LLM plateforme : débit systématique
  // (markup inclus), quel que soit le dénouement (clarify / 409 / run).
  const billPlanning = (outputChars: number, runId?: string | null) => {
    if (!onPlatformKey) return;
    const cost = estimatePlanningCostCents(keyResult.resolved.apiModel, goal, page, outputChars);
    void debitPlatformUsage(user.id, cost, "Planification de mission", runId ?? null);
  };

  // L'agent demande des précisions avant de bâtir un plan (mission complexe /
  // ordre ambigu) : pas de run, on renvoie les questions à l'interface.
  if (built.kind === "clarify") {
    billPlanning(JSON.stringify(built.questions).length);
    return NextResponse.json({ clarify: built.questions });
  }

  // Connecteur requis non connecté → on ne crée PAS de run mort-né (le worker
  // le ferait échouer d'emblée). On renvoie la liste pour que l'extension
  // propose de connecter l'app, sans consommer de run.
  if (built.missingConnectors.length > 0) {
    billPlanning(JSON.stringify(built.manifest ?? {}).length);
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

  // Contenus d'onglets capturés PAR le navigateur (session utilisateur) :
  // injectés comme variables {{tab_N}} — même numérotation que le contexte
  // montré au planificateur. C'est ce qui permet de croiser des pages derrière
  // login sans web_fetch (qui n'a pas la session).
  const tabVars: Record<string, string> = {};
  if (page.content?.trim()) tabVars.page_active = page.content.slice(0, 15_000);
  (page.openTabs ?? []).slice(0, 30).forEach((t, i) => {
    if (t.content?.trim()) tabVars[`tab_${i + 1}`] = t.content.slice(0, 12_000);
  });

  const admin = createAdminClient();
  const { data: run, error: insertError } = await admin
    .from("listing_agent_runs")
    .insert({
      user_id: user.id,
      listing_id: null,
      status: "pending",
      dry_run: false,
      inputs: {
        ...tabVars,
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

  billPlanning(JSON.stringify(built.manifest).length, run.id);

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
    // Le plan contient du pilotage navigateur : l'extension doit armer son
    // exécuteur de tâches (le run dialoguera avec l'onglet de l'utilisateur).
    pilots: built.manifest.steps.some((s) => s.type === "browser"),
    runUrl: `/dashboard/runs/${run.id}`,
  });
}
