"use client";

import { useMemo, useState } from "react";
import {
  Sparkles,
  Loader2,
  PenLine,
  Bot,
  Plus,
  ListChecks,
  Check,
  AlertTriangle,
  Wand2,
  ArrowRight,
  Play,
} from "lucide-react";
import { AgentCanvas } from "@/components/builder/canvas/AgentCanvas";
import { NodeInspector } from "@/components/builder/canvas/NodeInspector";
import { defaultParamBindingKey } from "@/lib/builder/run-inputs";
import { resourcePlaceholder } from "@/lib/connectors/param-bindings";
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
import {
  computeReadiness,
  type NodeReadiness,
  type MissingItem,
} from "@/lib/builder/agent-readiness";

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

function questionFor(nr: NodeReadiness): string {
  if (nr.status === "ok") return `« ${nr.name} » est prête.`;
  const m = nr.missing[0];
  if (!m) return `« ${nr.name} » est à compléter.`;
  switch (m.kind) {
    case "connection":
      return `Choisis le connecteur et l'action pour « ${nr.name} ». Passe en mode manuel, ou décris-moi ce qu'elle doit faire.`;
    case "prompt":
      return `Décris ce que l'étape « ${nr.name} » doit produire — je rédige la consigne pour toi.`;
    case "expression":
      return `Quelle condition pour « ${nr.name} » ? (ex. « si le sentiment est négatif »)`;
    case "resource":
      return `Pour « ${nr.name} », quelle ressource « ${m.label} » utiliser ?`;
    default:
      return `Pour « ${nr.name} », quelle valeur pour « ${m.label} » ?`;
  }
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
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [assistantMsg, setAssistantMsg] = useState<string | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [addText, setAddText] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showEval, setShowEval] = useState(false);
  const [fixedDraft, setFixedDraft] = useState<Record<string, string>>({});

  const issues = useMemo(() => validatePlanGraph(graph, defaultModel), [graph, defaultModel]);
  const readiness = useMemo(() => computeReadiness(graph, defaultModel), [graph, defaultModel]);

  const focusedNode: PlanNode | null =
    graph.nodes.find((n) => n.id === selectedNodeId) ??
    graph.nodes.find((n) => n.id === readiness.firstIncompleteId) ??
    graph.nodes[0] ??
    null;
  const focusedReadiness = focusedNode
    ? readiness.nodes.find((n) => n.nodeId === focusedNode.id) ?? null
    : null;

  function patchNode(nodeId: string, patch: Partial<PlanNode>) {
    onGraphChange(updateNode(graph, nodeId, patch));
  }

  function askSubscriber(node: PlanNode, m: MissingItem) {
    if (m.kind === "resource" && m.resourceType) {
      patchNode(node.id, {
        params: { ...(node.params ?? {}), [m.key]: resourcePlaceholder(m.resourceType) },
        paramMeta: {
          ...(node.paramMeta ?? {}),
          [m.key]: { scope: "end_user", resourceType: m.resourceType, shared: false },
        },
        pinnedResources: { ...(node.pinnedResources ?? {}), [m.key]: false },
      });
      return;
    }
    const binding = defaultParamBindingKey(node.connectorId ?? "", m.key);
    patchNode(node.id, {
      params: { ...(node.params ?? {}), [m.key]: `{{${binding}}}` },
      paramMeta: { ...(node.paramMeta ?? {}), [m.key]: { scope: "end_user", shared: false } },
      pinnedResources: { ...(node.pinnedResources ?? {}), [m.key]: false },
    });
  }

  function setFixedValue(node: PlanNode, m: MissingItem, value: string) {
    if (!value.trim()) return;
    patchNode(node.id, {
      params: { ...(node.params ?? {}), [m.key]: value },
      paramMeta: { ...(node.paramMeta ?? {}), [m.key]: { scope: "builder_test", shared: false } },
      pinnedResources: { ...(node.pinnedResources ?? {}), [m.key]: true },
    });
    setFixedDraft((d) => ({ ...d, [`${node.id}:${m.key}`]: "" }));
  }

  function enableAiFill(node: PlanNode, m: MissingItem) {
    patchNode(node.id, {
      aiFills: {
        ...(node.aiFills ?? {}),
        [m.key]: { model: defaultModel, prompt: node.aiFills?.[m.key]?.prompt ?? "" },
      },
    });
  }

  function setAiFillPrompt(node: PlanNode, key: string, prompt: string) {
    patchNode(node.id, {
      aiFills: { ...(node.aiFills ?? {}), [key]: { model: defaultModel, prompt } },
    });
  }

  async function editViaAI(instruction: string) {
    if (!instruction.trim()) return;
    setAiLoading(true);
    setAiError(null);
    setAssistantMsg(null);
    try {
      const plan = graphToPlan(graph);
      const res = await fetch("/api/builder/edit-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, instruction: instruction.trim(), modelId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error || "Erreur IA");
        return;
      }
      const newGraph = layoutGraph(normalizeGraph(planToGraph(data.plan, defaultModel)));
      onGraphChange(newGraph);
      const changed = (data.changedIds as string[]) ?? [];
      setHighlightedIds(changed);
      setTimeout(() => setHighlightedIds([]), 3500);
      setAssistantMsg(
        changed.length > 0
          ? `C'est fait — j'ai ajusté ${changed.length} étape(s).`
          : "C'est fait.",
      );
    } catch {
      setAiError("Erreur réseau. Réessayez.");
    } finally {
      setAiLoading(false);
    }
  }

  function autoCompleteFocused() {
    if (!focusedNode) return;
    void editViaAI(
      `Configure entièrement l'étape « ${focusedNode.name} » (id ${focusedNode.id}) avec des valeurs raisonnables : ` +
        `lie chaque paramètre requis à une variable d'entrée {{snake_case}} (déclarée aussi dans "variables") ou à une sortie d'étape précédente, ` +
        `et pour les contenus rédactionnels (objet, corps, message) ajoute une étape LLM amont qui les génère. ` +
        `Ne mets jamais de fausses valeurs réelles (email, nom, clé).`,
    );
  }

  function autoCompleteAll() {
    const incomplete = readiness.nodes.filter((n) => n.status !== "ok");
    if (incomplete.length === 0) return;
    const detail = incomplete
      .map((n) => `- « ${n.name} » (id ${n.nodeId}) : ${n.missing.map((m) => m.label).join(", ") || "à finaliser"}`)
      .join("\n");
    void editViaAI(
      `Complète toutes les étapes incomplètes du plan en suivant les bonnes pratiques (variables d'entrée, sorties d'étapes, étapes LLM pour le contenu rédactionnel, approbation avant action risquée). Étapes à finaliser :\n${detail}`,
    );
  }

  const focusIndex = focusedNode ? graph.nodes.findIndex((n) => n.id === focusedNode.id) : -1;

  function goToNode(delta: number) {
    if (focusIndex < 0) return;
    const next = graph.nodes[focusIndex + delta];
    if (next) onSelect(next.id);
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

      {/* Barre de progression */}
      <div className="rounded-xl border border-line bg-card p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <ListChecks className="h-4 w-4 text-accent" />
            Progression — {readiness.okCount}/{readiness.total} étapes prêtes
          </div>
          <button
            type="button"
            onClick={() => setShowEval((v) => !v)}
            className="text-xs text-accent hover:underline"
          >
            {showEval ? "Masquer le détail" : "Évaluer la progression"}
          </button>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-card2">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${readiness.percent}%` }}
          />
        </div>
        {showEval && (
          <ul className="mt-3 space-y-1 text-xs">
            {readiness.nodes.map((n) => (
              <li key={n.nodeId} className="flex items-start gap-2">
                {n.status === "ok" ? (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                )}
                <button
                  type="button"
                  onClick={() => onSelect(n.nodeId)}
                  className="text-left text-ink-soft hover:text-ink"
                >
                  <span className="font-medium text-ink">{n.name}</span>
                  {n.missing.length > 0 && (
                    <span className="text-ink-faint"> — manque : {n.missing.map((m) => m.label).join(", ")}</span>
                  )}
                </button>
              </li>
            ))}
            {readiness.blockingIssues.map((msg, i) => (
              <li key={`b${i}`} className="flex items-start gap-2 text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {msg}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Prêt à tester */}
      {readiness.ready && (
        <button
          type="button"
          onClick={onGoToTest}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
        >
          <Play className="h-4 w-4" /> Tout est prêt — Lancer le test
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
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs text-ink-soft hover:bg-card2"
        >
          <Plus className="h-3.5 w-3.5" /> Ajouter un nœud
        </button>
        {readiness.nodes.some((n) => n.status !== "ok") && (
          <button
            type="button"
            disabled={aiLoading}
            onClick={autoCompleteAll}
            className="inline-flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/5 px-3 py-1.5 text-xs text-accent hover:bg-accent/10 disabled:opacity-50"
          >
            <Wand2 className="h-3.5 w-3.5" /> Tout compléter par IA
          </button>
        )}
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

      {showAdd && (
        <div className="flex gap-2 rounded-lg border border-line bg-card2 p-2">
          <input
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            placeholder={`Décris l'étape à ajouter après « ${focusedNode?.name ?? "…"} »`}
            className="h-9 flex-1 rounded-lg border border-line px-2 text-sm"
          />
          <button
            type="button"
            disabled={aiLoading || addText.trim().length < 3}
            onClick={() => {
              void editViaAI(
                `Ajoute une nouvelle étape après « ${focusedNode?.name ?? ""} » (id ${focusedNode?.id ?? ""}) : ${addText.trim()}`,
              );
              setAddText("");
              setShowAdd(false);
            }}
            className="rounded-lg bg-accent px-3 text-xs text-white disabled:opacity-50"
          >
            Ajouter
          </button>
        </div>
      )}

      {/* Mode manuel : inspecteur complet */}
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
        /* Copilote guidé */
        <div className="rounded-xl border border-line bg-card">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <p className="text-sm font-medium text-ink">Copilote</p>
            {focusedNode && (
              <span className="ml-auto text-[11px] text-ink-faint">
                Étape {focusIndex + 1}/{graph.nodes.length} · {focusedNode.name}
              </span>
            )}
          </div>

          <div className="space-y-3 p-3">
            {focusedReadiness && (
              <p className="text-sm text-ink">{questionFor(focusedReadiness)}</p>
            )}

            {/* Actions rapides par paramètre manquant */}
            {focusedNode &&
              focusedReadiness?.missing.map((m) => {
                const draftKey = `${focusedNode.id}:${m.key}`;
                const aiActive = !!focusedNode.aiFills?.[m.key];
                if (m.kind === "connection" || m.kind === "prompt" || m.kind === "expression") {
                  return (
                    <div key={m.key} className="rounded-lg bg-card2 px-2 py-1.5 text-xs text-ink-soft">
                      <button
                        type="button"
                        onClick={() => setMode("manual")}
                        className="font-medium text-accent hover:underline"
                      >
                        Ouvrir en mode manuel
                      </button>{" "}
                      ou décris ci-dessous ce que tu veux, l&apos;IA s&apos;en charge.
                    </div>
                  );
                }
                return (
                  <div key={m.key} className="rounded-lg border border-line p-2">
                    <p className="text-xs font-medium text-ink">{m.label}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => askSubscriber(focusedNode, m)}
                        className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink-soft hover:border-accent"
                      >
                        Demander à l&apos;abonné
                      </button>
                      {m.kind === "resource" ? (
                        <button
                          type="button"
                          onClick={() => setMode("manual")}
                          className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink-soft hover:border-accent"
                        >
                          Choisir une ressource
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => enableAiFill(focusedNode, m)}
                          className={`rounded-full border px-2 py-0.5 text-[10px] ${
                            aiActive ? "border-accent bg-accent/10 text-accent" : "border-line text-ink-soft hover:border-accent"
                          }`}
                        >
                          Générer par IA
                        </button>
                      )}
                    </div>
                    {m.kind !== "resource" && (
                      <div className="mt-1 flex gap-1">
                        <input
                          value={fixedDraft[draftKey] ?? ""}
                          onChange={(e) =>
                            setFixedDraft((d) => ({ ...d, [draftKey]: e.target.value }))
                          }
                          placeholder="Valeur fixe…"
                          className="h-7 flex-1 rounded border border-line px-2 text-[11px]"
                        />
                        <button
                          type="button"
                          onClick={() => setFixedValue(focusedNode, m, fixedDraft[draftKey] ?? "")}
                          className="rounded border border-line px-2 text-[10px] text-ink-soft hover:bg-card2"
                        >
                          OK
                        </button>
                      </div>
                    )}
                    {aiActive && (
                      <textarea
                        value={focusedNode.aiFills?.[m.key]?.prompt ?? ""}
                        onChange={(e) => setAiFillPrompt(focusedNode, m.key, e.target.value)}
                        rows={2}
                        placeholder="Consigne pour l'IA (ex. rédige un objet accrocheur à partir de {{sujet}})"
                        className="mt-1 w-full rounded border border-accent/40 bg-accent/5 px-2 py-1 text-[11px]"
                      />
                    )}
                  </div>
                );
              })}

            {focusedNode && focusedReadiness?.status !== "ok" && (
              <button
                type="button"
                disabled={aiLoading}
                onClick={autoCompleteFocused}
                className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs text-white disabled:opacity-50"
              >
                {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                Laisser l&apos;IA compléter cette étape
              </button>
            )}

            {focusedReadiness?.status === "ok" && (
              <div className="flex items-center gap-2 text-xs text-emerald-700">
                <Check className="h-4 w-4" /> Cette étape est prête.
                {focusIndex < graph.nodes.length - 1 && (
                  <button
                    type="button"
                    onClick={() => goToNode(1)}
                    className="ml-auto inline-flex items-center gap-1 text-accent hover:underline"
                  >
                    Étape suivante <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}

            {/* Champ libre → IA */}
            <div className="flex gap-2 border-t border-line pt-3">
              <input
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void editViaAI(freeText);
                    setFreeText("");
                  }
                }}
                disabled={aiLoading}
                placeholder="Explique à l'IA ce que tu veux (ex. « pour l'envoi, demande l'email à l'abonné »)"
                className="h-9 flex-1 rounded-lg border border-line px-2 text-sm disabled:opacity-50"
              />
              <button
                type="button"
                disabled={aiLoading || freeText.trim().length < 3}
                onClick={() => {
                  void editViaAI(freeText);
                  setFreeText("");
                }}
                className="flex h-9 items-center gap-1 rounded-lg bg-accent px-3 text-xs text-white disabled:opacity-50"
              >
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              </button>
            </div>
            {assistantMsg && <p className="text-xs text-emerald-700">{assistantMsg}</p>}
            {aiError && <p className="text-xs text-destructive">{aiError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
