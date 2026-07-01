import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBuilderApiKey } from "@/lib/builder/api-key";
import { builderRateLimit } from "@/lib/builder/rate-limit";
import { runCopilotTurn, type CopilotMessage, type CopilotContext } from "@/lib/builder/copilot";
import { parseGeneratedAgentPlan } from "@/lib/builder/generate-agent-plan";
import { planToGraph } from "@/lib/builder/plan-graph";
import { computeReadiness } from "@/lib/builder/agent-readiness";
import { MODEL_CATALOG } from "@/lib/llm/providers";
import { listUserConnections } from "@/lib/connections";
import { connectionMatchesConnector, canonicalConnectorKey } from "@/lib/connectors/resolve-id";

export const dynamic = "force-dynamic";

async function buildContext(userId: string, plan: ReturnType<typeof parseGeneratedAgentPlan>): Promise<CopilotContext> {
  const graph = planToGraph(plan);
  const readiness = computeReadiness(graph);

  const usedConnectors = new Set(
    graph.nodes
      .filter((n) => n.kind === "action" && n.connectorId)
      .map((n) => n.connectorId as string),
  );
  for (const rc of plan.requiredConnectors ?? []) usedConnectors.add(rc.connectorId);

  let connections: Awaited<ReturnType<typeof listUserConnections>> = [];
  try {
    connections = await listUserConnections(userId);
  } catch {
    connections = [];
  }
  const connectedConns = connections.filter((c) => c.status === "connected");
  const matchConn = (id: string) =>
    connectedConns.find((c) => connectionMatchesConnector(c.connectorId, id));

  // Liste COMPLÈTE des connecteurs déjà connectés du compte (pas seulement ceux
  // déjà présents dans le plan). Sans ça, quand on demande d'AJOUTER un nœud
  // (ex. envoi Gmail), le connecteur n'est pas encore dans le plan → le copilote
  // ne « voit » pas qu'il est connecté et demande à tort de le reconnecter.
  const seenKeys = new Set<string>();
  const connectedConnectors: { id: string; account?: string }[] = [];
  for (const c of connectedConns) {
    const key = canonicalConnectorKey(c.connectorId);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    connectedConnectors.push({
      id: c.connectorId,
      account: c.accountEmail ?? c.accountName ?? c.workspaceName ?? undefined,
    });
  }
  const disconnectedConnectors = Array.from(usedConnectors).filter((id) => !matchConn(id));

  return {
    models: MODEL_CATALOG.map((m) => ({ id: m.id, label: m.label, provider: m.provider })),
    connectedConnectors,
    disconnectedConnectors,
    gaps: readiness.nodes.map((n) => ({
      nodeId: n.nodeId,
      name: n.name,
      kind: n.kind,
      missing: n.missing.map((m) => ({
        key: m.key,
        label: m.label,
        kind: m.kind,
        resourceType: m.resourceType,
      })),
    })),
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const limited = await builderRateLimit(user.id);
  if (limited) return limited;

  const body = await request.json();
  const { plan, messages, modelId } = body as {
    plan?: unknown;
    messages?: CopilotMessage[];
    modelId?: string;
  };

  let parsedPlan;
  try {
    parsedPlan = parseGeneratedAgentPlan(plan);
  } catch {
    return NextResponse.json({ error: "Plan invalide." }, { status: 400 });
  }

  const safeMessages: CopilotMessage[] = Array.isArray(messages)
    ? messages
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-20)
    : [];

  const keyResult = await getBuilderApiKey(user.id, modelId ?? "gpt-5.4-mini");
  if (!keyResult.ok) {
    return NextResponse.json({ error: keyResult.error }, { status: 503 });
  }

  try {
    const context = await buildContext(user.id, parsedPlan);
    const turn = await runCopilotTurn({
      plan: parsedPlan,
      messages: safeMessages,
      apiKey: keyResult.apiKey,
      resolved: keyResult.resolved,
      context,
    });
    return NextResponse.json({ ...turn, model: keyResult.resolved.catalogId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur copilote" },
      { status: 500 },
    );
  }
}
