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
  Code2,
  ClipboardCopy,
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
  graphToSteps,
  stepsToGraph,
  type PlanGraph,
  type PlanNode,
} from "@/lib/builder/plan-graph";
import { AgentStepSchema, type AgentStep } from "@/lib/agent/schema";
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
  const [mode, setMode] = useState<"guided" | "manual" | "code">("guided");
  // Mode Code : édition directe du JSON des étapes (pour les profils techniques).
  const [codeText, setCodeText] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeApplied, setCodeApplied] = useState(false);
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

  const lastHistoryRef = useRef<ChatMessage[]>([]);

  async function runCopilot(history: ChatMessage[], attempt = 0) {
    lastHistoryRef.current = history;
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
        // Relance automatique silencieuse : le message de l'utilisateur est
        // déjà dans l'historique, il n'a RIEN à retaper.
        if (attempt < 1) {
          setLoading(false);
          await new Promise((r) => setTimeout(r, 600));
          return runCopilot(history, attempt + 1);
        }
        setError(data.error || "Erreur copilote");
        return;
      }
      if (data.plan) {
        const newGraph = layoutGraph(normalizeGraph(planToGraph(data.plan, defaultModel)));
        onGraphChange(newGraph);
        graphRef.current = newGraph;
        const changed = (data.changedIds as string[]) ?? [];
        setHighlightedIds(changed);
        setTimeout(() => setHighlightedIds([]), 3500);
        // Résout les actions Composio-only inventées → vrais outils + schéma réel.
        // GARDE anti-écrasement : l'enrichissement est lent (fetch Composio) ;
        // si l'arbo a changé entre-temps (nouveau tour copilote, édition
        // manuelle), on jette ce résultat périmé au lieu d'écraser — c'était
        // la cause des nœuds ajoutés qui « disparaissaient ».
        void enrichComposioActions(newGraph).then((enriched) => {
          if (enriched === newGraph) return;
          if (graphRef.current !== newGraph) return;
          const finalGraph = layoutGraph(normalizeGraph(enriched));
          onGraphChange(finalGraph);
          graphRef.current = finalGraph;
        });
      }
      if (typeof data.focusStepId === "string") onSelect(data.focusStepId);
      if (Array.isArray(data.completedStepIds)) setCompletedIds(data.completedStepIds);
      setAwaiting(data.awaitingUser !== false);
      setDone(!!data.done);
      setMessages((m) => [...m, { role: "assistant", content: String(data.assistant ?? "") }]);
    } catch {
      if (attempt < 1) {
        setLoading(false);
        await new Promise((r) => setTimeout(r, 600));
        return runCopilot(history, attempt + 1);
      }
      setError("Erreur réseau.");
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
          {done && <span className="text-xs text-success">Toutes les étapes sont prêtes</span>}
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
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-semibold text-success transition-colors hover:bg-success/20"
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
              mode === "guided" ? "bg-accent text-accent-ink" : "bg-card text-ink-soft"
            }`}
          >
            <Bot className="h-3.5 w-3.5" /> Guidé par l&apos;IA
          </button>
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs ${
              mode === "manual" ? "bg-accent text-accent-ink" : "bg-card text-ink-soft"
            }`}
          >
            <PenLine className="h-3.5 w-3.5" /> Mode manuel
          </button>
          <button
            type="button"
            onClick={() => {
              setCodeText(JSON.stringify(graphToSteps(graph, defaultModel), null, 2));
              setCodeError(null);
              setCodeApplied(false);
              setMode("code");
            }}
            title="Édite le JSON des étapes directement — pour les profils techniques"
            className={`flex items-center gap-1 px-3 py-1.5 text-xs ${
              mode === "code" ? "bg-accent text-accent-ink" : "bg-card text-ink-soft"
            }`}
          >
            <Code2 className="h-3.5 w-3.5" /> Code
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
            className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs text-warning"
          >
            Reconnecter automatiquement
          </button>
        )}
      </div>

      {mode === "code" ? (
        /* Mode CODE — le manifeste en JSON, éditable, validé par schéma. */
        <div className="rounded-xl border border-line bg-card">
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <Code2 className="h-4 w-4 text-accent" /> Code de l&apos;agent (JSON des étapes)
            </p>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(codeText).catch(() => undefined)}
              className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] text-ink-soft hover:bg-card2"
            >
              <ClipboardCopy className="h-3 w-3" /> Copier
            </button>
          </div>
          <div className="p-3">
            <p className="mb-2 text-[11px] text-ink-faint">
              Chaque étape : <code className="rounded bg-line/60 px-1">type</code> (llm · tool · action ·
              condition · approval · retrieve · parallel), <code className="rounded bg-line/60 px-1">outputKey</code> pour
              référencer sa sortie via {"{{cle}}"}. Appliquer re-valide tout et met à jour l&apos;arborescence —
              tes modifications visuelles et le copilote restent utilisables ensuite.
            </p>
            <textarea
              value={codeText}
              onChange={(e) => {
                setCodeText(e.target.value);
                setCodeError(null);
                setCodeApplied(false);
              }}
              spellCheck={false}
              rows={22}
              className="w-full resize-y rounded-lg border border-line bg-[#0f1419] p-3 font-mono text-[12px] leading-relaxed text-emerald-100 outline-none focus:border-accent"
            />
            {codeError && (
              <p className="mt-2 whitespace-pre-wrap rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {codeError}
              </p>
            )}
            {codeApplied && !codeError && (
              <p className="mt-2 flex items-center gap-1 text-xs text-success">
                <Check className="h-3.5 w-3.5" /> Appliqué — l&apos;arborescence est à jour.
              </p>
            )}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  try {
                    const parsed = JSON.parse(codeText) as unknown;
                    if (!Array.isArray(parsed) || parsed.length === 0) {
                      setCodeError("Le JSON doit être un TABLEAU d'étapes non vide.");
                      return;
                    }
                    const steps: AgentStep[] = [];
                    for (let i = 0; i < parsed.length; i++) {
                      const res = AgentStepSchema.safeParse(parsed[i]);
                      if (!res.success) {
                        const issue = res.error.issues[0];
                        setCodeError(
                          `Étape ${i + 1} invalide — ${issue?.path?.join(".") || "?"} : ${issue?.message ?? "schéma non respecté"}`,
                        );
                        return;
                      }
                      steps.push(res.data);
                    }
                    const g = stepsToGraph(steps, graph.meta);
                    onGraphChange(g);
                    graphRef.current = g;
                    setCodeError(null);
                    setCodeApplied(true);
                  } catch (e) {
                    setCodeError(`JSON invalide : ${e instanceof Error ? e.message : e}`);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-hover"
              >
                <Check className="h-4 w-4" /> Appliquer à l&apos;arborescence
              </button>
              <button
                type="button"
                onClick={() => {
                  setCodeText(JSON.stringify(graphToSteps(graph, defaultModel), null, 2));
                  setCodeError(null);
                  setCodeApplied(false);
                }}
                className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:bg-card2"
              >
                Recharger depuis l&apos;arbo
              </button>
            </div>
          </div>
        </div>
      ) : mode === "manual" ? (
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
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
                <p className="flex-1 text-xs text-destructive">
                  {error} — ton message est conservé, rien à retaper.
                </p>
                <button
                  type="button"
                  onClick={() => void runCopilot(lastHistoryRef.current)}
                  className="shrink-0 rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-accent-ink hover:bg-accent-hover"
                >
                  Renvoyer
                </button>
              </div>
            )}
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
            <div className="flex items-center gap-2 border-t border-line px-3 py-2 text-xs text-success">
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
                className="flex h-9 items-center gap-1 rounded-lg bg-accent px-3 text-xs font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-50"
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
