"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Loader2,
  PenLine,
  Bot,
  Plus,
  Check,
  Play,
  Send,
} from "lucide-react";
import { AgentCanvas } from "@/components/builder/canvas/AgentCanvas";
import { NodeInspector } from "@/components/builder/canvas/NodeInspector";
import { CatalogSingleSelect } from "@/components/builder/CatalogSingleSelect";
import { ConnectionStatusRow } from "@/components/builder/canvas/ConnectionStatusRow";
import {
  ManualResourceInput,
  resolveResourceVisibility,
  type ResourceVisibility,
} from "@/components/builder/canvas/ManualResourceInput";
import { actionInputsForStep } from "@/lib/connectors/action-inputs";
import { isResourcePlaceholder, resourcePlaceholder } from "@/lib/connectors/param-bindings";
import { getBuilderModels } from "@/lib/catalogs";
import {
  graphToPlan,
  planToGraph,
  normalizeGraph,
  layoutGraph,
  graphHasRepairableIssues,
  updateNode,
  validatePlanGraph,
  type PlanGraph,
  type PlanNode,
} from "@/lib/builder/plan-graph";
import { computeReadiness } from "@/lib/builder/agent-readiness";
import { enrichComposioActions } from "@/lib/builder/enrich-composio-actions";
import { KnowledgeBase } from "@/components/builder/canvas/KnowledgeBase";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Contrôles réels ancrés sur le nœud ciblé par le copilote (modèle, connexion, ressources). */
function FocusControls({
  node,
  defaultModel,
  onPatch,
}: {
  node: PlanNode;
  defaultModel: string;
  onPatch: (patch: Partial<PlanNode>) => void;
}) {
  const builderModels = getBuilderModels() as { id: string; label: string; provider?: string }[];

  if (node.kind === "llm") {
    return (
      <div className="space-y-1">
        <label className="text-[11px] text-ink-soft">Modèle IA pour cette analyse</label>
        <CatalogSingleSelect
          catalog={builderModels}
          value={node.model ?? defaultModel}
          onChange={(id) => onPatch({ model: id })}
          groupByKey="provider"
          placeholder="Choisir le modèle"
        />
      </div>
    );
  }

  if (node.kind === "action" && node.connectorId) {
    const inputs = actionInputsForStep({
      connector: node.connectorId,
      action: node.actionSlug ?? "",
      inputsSchema: node.actionInputs,
    });
    const resourceInputs = inputs.filter(
      (i) => i.resourceType && (i.kind === "resource" || !!i.resourceType),
    );

    const applyResource = (key: string, resourceType: string) => (
      val: string,
      isPinned: boolean,
      vis: ResourceVisibility,
    ) => {
      if (!isPinned || vis === "client") {
        onPatch({
          pinnedResources: { ...(node.pinnedResources ?? {}), [key]: false },
          params: { ...(node.params ?? {}), [key]: resourcePlaceholder(resourceType) },
          paramMeta: {
            ...(node.paramMeta ?? {}),
            [key]: { scope: "end_user", resourceType, shared: false },
          },
        });
        return;
      }
      const shared = vis === "builder_shared";
      onPatch({
        pinnedResources: { ...(node.pinnedResources ?? {}), [key]: true },
        params: { ...(node.params ?? {}), [key]: val },
        paramMeta: {
          ...(node.paramMeta ?? {}),
          [key]: { scope: "builder_test", resourceType, shared },
        },
        ...(shared ? { sharedEnv: true } : {}),
      });
    };

    return (
      <div className="space-y-2">
        <ConnectionStatusRow connectorId={node.connectorId} />
        {resourceInputs.map((input) => {
          const value = node.params?.[input.key] ?? "";
          const pinned =
            node.pinnedResources?.[input.key] ??
            (!!value && !isResourcePlaceholder(value));
          const visibility = resolveResourceVisibility(pinned, value, node.paramMeta?.[input.key]);
          return (
            <ManualResourceInput
              key={input.key}
              resourceType={input.resourceType!}
              label={input.label}
              value={value}
              pinned={pinned}
              visibility={visibility}
              onChange={applyResource(input.key, input.resourceType!)}
              connectorId={node.connectorId}
              dependsOnValue={input.dependsOn ? node.params?.[input.dependsOn] : undefined}
            />
          );
        })}
      </div>
    );
  }

  return null;
}

interface Props {
  graph: PlanGraph;
  onGraphChange: (g: PlanGraph) => void;
  selectedNodeId: string | null;
  onSelect: (id: string | null) => void;
  onMoveNode: (id: string, x: number, y: number) => void;
  defaultModel: string;
  modelId: string;
  envFields: { key: string; label: string }[];
  disconnectedConnectors: string[];
  onGoToTest: () => void;
}

export function GuidedBuilder({
  graph,
  onGraphChange,
  selectedNodeId,
  onSelect,
  onMoveNode,
  defaultModel,
  modelId,
  envFields,
  disconnectedConnectors,
  onGoToTest,
}: Props) {
  const [mode, setMode] = useState<"guided" | "manual">("guided");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaiting, setAwaiting] = useState(true);
  const [done, setDone] = useState(false);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);

  // Réf vers le graphe courant pour l'appel copilote (évite les closures périmées).
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const issues = useMemo(() => validatePlanGraph(graph, defaultModel), [graph, defaultModel]);
  const readiness = useMemo(() => computeReadiness(graph, defaultModel), [graph, defaultModel]);

  const total = graph.nodes.length;
  const copilotPercent = total === 0 ? 0 : Math.round((completedIds.length / total) * 100);

  const focusedNode: PlanNode | null =
    graph.nodes.find((n) => n.id === selectedNodeId) ?? graph.nodes[0] ?? null;

  function patchNode(nodeId: string, patch: Partial<PlanNode>) {
    onGraphChange(updateNode(graph, nodeId, patch));
  }

  async function runCopilot(history: ChatMessage[]) {
    setLoading(true);
    setError(null);
    try {
      const plan = graphToPlan(graphRef.current);
      const res = await fetch("/api/builder/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, messages: history, modelId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur copilote");
        return;
      }
      if (data.plan) {
        const newGraph = layoutGraph(normalizeGraph(planToGraph(data.plan, defaultModel)));
        onGraphChange(newGraph);
        const changed = (data.changedIds as string[]) ?? [];
        setHighlightedIds(changed);
        setTimeout(() => setHighlightedIds([]), 3500);
        // Résout les actions Composio-only inventées → vrais outils + schéma réel.
        void enrichComposioActions(newGraph).then((enriched) => {
          if (enriched !== newGraph) onGraphChange(layoutGraph(normalizeGraph(enriched)));
        });
      }
      if (typeof data.focusStepId === "string") onSelect(data.focusStepId);
      if (Array.isArray(data.completedStepIds)) setCompletedIds(data.completedStepIds);
      setAwaiting(data.awaitingUser !== false);
      setDone(!!data.done);
      setMessages((m) => [...m, { role: "assistant", content: String(data.assistant ?? "") }]);
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  // Démarrage automatique de l'accompagnement (une seule fois).
  useEffect(() => {
    if (startedRef.current || graph.nodes.length === 0) return;
    startedRef.current = true;
    void runCopilot([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  function send(text: string) {
    const t = text.trim();
    if (!t || loading) return;
    const next = [...messages, { role: "user" as const, content: t }];
    setMessages(next);
    setInput("");
    void runCopilot(next);
  }

  return (
    <div className="space-y-4">
      {/* Arborescence en grand */}
      <div className="rounded-xl border border-line bg-card2/40 p-2">
        <AgentCanvas
          graph={graph}
          selectedId={focusedNode?.id}
          onSelect={onSelect}
          onMoveNode={onMoveNode}
          highlightedIds={highlightedIds}
          validationIssues={issues}
          disconnectedConnectors={disconnectedConnectors}
        />
      </div>

      {/* Progression pilotée par le copilote */}
      <div className="rounded-xl border border-line bg-card p-3">
        <div className="flex items-center justify-between text-sm font-medium text-ink">
          <span className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-accent" />
            Accompagnement — {completedIds.length}/{total} étapes finalisées
          </span>
          {done && <span className="text-xs text-emerald-700">Toutes les étapes sont prêtes</span>}
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-card2">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${copilotPercent}%` }}
          />
        </div>
      </div>

      {/* Base de connaissances (RAG) */}
      <KnowledgeBase />

      {/* Prêt à tester */}
      {(done || readiness.ready) && (
        <button
          type="button"
          onClick={onGoToTest}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
        >
          <Play className="h-4 w-4" /> Lancer le test
        </button>
      )}

      {/* Barre d'actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-line">
          <button
            type="button"
            onClick={() => setMode("guided")}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs ${
              mode === "guided" ? "bg-accent text-white" : "bg-card text-ink-soft"
            }`}
          >
            <Bot className="h-3.5 w-3.5" /> Guidé par l&apos;IA
          </button>
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs ${
              mode === "manual" ? "bg-accent text-white" : "bg-card text-ink-soft"
            }`}
          >
            <PenLine className="h-3.5 w-3.5" /> Mode manuel
          </button>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => send(`Ajoute une étape après « ${focusedNode?.name ?? ""} ».`)}
          className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs text-ink-soft hover:bg-card2 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Ajouter un nœud
        </button>
        {graphHasRepairableIssues(graph) && (
          <button
            type="button"
            onClick={() => onGraphChange(layoutGraph(normalizeGraph(graph)))}
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-800"
          >
            Reconnecter automatiquement
          </button>
        )}
      </div>

      {mode === "manual" ? (
        <NodeInspector
          node={focusedNode}
          graph={graph}
          onChange={(n) => patchNode(n.id, n)}
          onGraphChange={onGraphChange}
          onClose={() => setMode("guided")}
          defaultModel={defaultModel}
          envFields={envFields}
        />
      ) : (
        /* Copilote GPT — conversation pas à pas */
        <div className="flex flex-col rounded-xl border border-line bg-card">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <p className="text-sm font-medium text-ink">Copilote</p>
            {focusedNode && (
              <span className="ml-auto text-[11px] text-ink-faint">{focusedNode.name}</span>
            )}
          </div>

          <div ref={scrollRef} className="max-h-72 space-y-2 overflow-y-auto px-3 py-3">
            {messages.length === 0 && !loading && (
              <p className="text-xs text-ink-faint">Le copilote prépare la première question…</p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`whitespace-pre-wrap rounded-lg px-2.5 py-1.5 text-xs ${
                  m.role === "user"
                    ? "ml-8 bg-accent/10 text-ink"
                    : "mr-8 bg-card2 text-ink-soft"
                }`}
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-ink-soft">
                <Loader2 className="h-3 w-3 animate-spin" /> Le copilote réfléchit…
              </div>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          {focusedNode && !done && (
            <div className="border-t border-line px-3 py-2">
              <FocusControls
                node={focusedNode}
                defaultModel={defaultModel}
                onPatch={(patch) => patchNode(focusedNode.id, patch)}
              />
            </div>
          )}

          {done ? (
            <div className="flex items-center gap-2 border-t border-line px-3 py-2 text-xs text-emerald-700">
              <Check className="h-4 w-4" /> L&apos;agent est finalisé — vous pouvez lancer le test.
            </div>
          ) : (
            <div className="flex gap-2 border-t border-line p-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                disabled={loading}
                placeholder={
                  awaiting ? "Répondez au copilote…" : "Ajoutez une précision…"
                }
                className="h-9 flex-1 rounded-lg border border-line px-3 text-sm disabled:opacity-50"
              />
              <button
                type="button"
                disabled={loading || input.trim().length < 1}
                onClick={() => send(input)}
                className="flex h-9 items-center gap-1 rounded-lg bg-accent px-3 text-xs text-white disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
