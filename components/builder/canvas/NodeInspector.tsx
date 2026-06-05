"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { CatalogSingleSelect } from "@/components/builder/CatalogSingleSelect";
import { getBuilderModels } from "@/lib/catalogs";
import { getConnectorAction } from "@/lib/connectors/registry";
import {
  addNode,
  createDefaultNode,
  removeNode,
  type PlanGraph,
  type PlanNode,
  type PlanNodeKind,
} from "@/lib/builder/plan-graph";

const TOOLS = [
  { id: "web_search" as const, label: "Recherche web" },
  { id: "http_fetch" as const, label: "HTTP fetch" },
  { id: "file_read" as const, label: "Lecture fichier" },
];

const NODE_KINDS: { id: PlanNodeKind; label: string }[] = [
  { id: "llm", label: "IA" },
  { id: "action", label: "Action" },
  { id: "tool", label: "Outil" },
  { id: "condition", label: "Condition" },
  { id: "approval", label: "Approbation" },
  { id: "code", label: "Code" },
];

interface Props {
  node: PlanNode | null;
  graph: PlanGraph | null;
  onChange: (node: PlanNode) => void;
  onGraphChange: (graph: PlanGraph) => void;
  onClose: () => void;
  defaultModel?: string;
  envFields?: { key: string; label: string }[];
}

function insertAtCursor(current: string, insert: string, textareaId: string): string {
  const el = document.getElementById(textareaId) as HTMLTextAreaElement | null;
  if (!el) return current + insert;
  const start = el.selectionStart ?? current.length;
  const end = el.selectionEnd ?? current.length;
  return current.slice(0, start) + insert + current.slice(end);
}

export function NodeInspector({
  node,
  graph,
  onChange,
  onGraphChange,
  onClose,
  defaultModel = "gpt-5.4",
  envFields = [],
}: Props) {
  const [addKind, setAddKind] = useState<PlanNodeKind>("llm");

  if (!node || !graph) {
    return (
      <div className="rounded-xl border border-line bg-card p-4 text-sm text-ink-soft">
        Sélectionnez un nœud sur le canvas pour l&apos;éditer.
      </div>
    );
  }

  const currentNode = node;
  const currentGraph = graph;
  const outgoing = currentGraph.edges.filter((e) => e.source === currentNode.id);
  const priorOutputs = currentGraph.nodes
    .filter((n) => n.id !== currentNode.id)
    .map((n) => n.outputKey)
    .filter(Boolean);

  function patch(p: Partial<PlanNode>) {
    onChange({ ...currentNode, ...p, id: currentNode.id, kind: currentNode.kind });
  }

  function updateEdgeLabel(targetId: string, label: string) {
    const edges = currentGraph.edges.map((e) =>
      e.source === currentNode.id && e.target === targetId ? { ...e, label } : e,
    );
    onGraphChange({ ...currentGraph, edges });
  }

  return (
    <div className="flex max-h-[520px] flex-col rounded-xl border border-line bg-card">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <p className="text-sm font-semibold text-ink">Inspecteur</p>
        <button type="button" onClick={onClose} className="text-ink-faint hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <div>
          <label className="text-xs text-ink-soft">Nom</label>
          <input
            value={node.name}
            onChange={(e) => patch({ name: e.target.value })}
            className="mt-1 h-9 w-full rounded-lg border border-line px-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-ink-soft">Description</label>
          <textarea
            value={node.description ?? ""}
            onChange={(e) => patch({ description: e.target.value })}
            rows={2}
            className="mt-1 w-full rounded-lg border border-line px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-ink-soft">Clé de sortie</label>
          <input
            value={node.outputKey}
            onChange={(e) => patch({ outputKey: e.target.value })}
            className="mt-1 h-9 w-full rounded-lg border border-line px-2 font-mono text-sm"
          />
        </div>

        {node.kind === "llm" && (
          <>
            <div>
              <label className="text-xs text-ink-soft">Modèle</label>
              <CatalogSingleSelect
                catalog={getBuilderModels() as { id: string; label: string; provider?: string }[]}
                value={node.model ?? defaultModel}
                onChange={(id) => patch({ model: id })}
                groupByKey="provider"
                placeholder="Modèle IA"
              />
            </div>
            <div>
              <label className="text-xs text-ink-soft">Prompt</label>
              <div className="mt-1 flex flex-wrap gap-1">
                {envFields.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() =>
                      patch({
                        prompt: insertAtCursor(node.prompt ?? "", `{{${f.key}}}`, "inspector-prompt"),
                      })
                    }
                    className="rounded bg-card2 px-1.5 py-0.5 text-[10px] text-ink-soft hover:bg-accent/10"
                  >
                    + {f.key}
                  </button>
                ))}
                {priorOutputs.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() =>
                      patch({
                        prompt: insertAtCursor(node.prompt ?? "", `{{${k}}}`, "inspector-prompt"),
                      })
                    }
                    className="rounded bg-card2 px-1.5 py-0.5 text-[10px] text-ink-soft hover:bg-accent/10"
                  >
                    + {k}
                  </button>
                ))}
              </div>
              <textarea
                id="inspector-prompt"
                value={node.prompt ?? ""}
                onChange={(e) => patch({ prompt: e.target.value })}
                rows={5}
                className="mt-1 w-full rounded-lg border border-line px-2 py-1 font-mono text-xs"
              />
            </div>
          </>
        )}

        {node.kind === "action" && (
          <div className="space-y-2">
            <p className="text-[10px] text-ink-faint">
              Connexion OAuth = « Vos accès » (hors manifeste). Ici : bindings de contenu uniquement.
            </p>
            <div>
              <label className="text-xs text-ink-soft">Connecteur</label>
              <input
                value={node.connectorId ?? ""}
                onChange={(e) => patch({ connectorId: e.target.value })}
                placeholder="ex. gmail, slack, linkedin"
                className="mt-1 h-9 w-full rounded-lg border border-line px-2 font-mono text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-ink-soft">Action</label>
              <input
                value={node.actionSlug ?? ""}
                onChange={(e) => patch({ actionSlug: e.target.value })}
                placeholder="ex. gmail.send, slack.send"
                className="mt-1 h-9 w-full rounded-lg border border-line px-2 font-mono text-sm"
              />
            </div>
            {currentNode.connectorId && currentNode.actionSlug && (
              <div className="space-y-2 border-t border-line pt-2">
                <p className="text-xs font-medium text-ink-soft">Paramètres (bindings {"{{variable}}"})</p>
                {(getConnectorAction(currentNode.connectorId, currentNode.actionSlug)?.inputs ?? []).map(
                  (input) => (
                    <div key={input.key}>
                      <label className="text-[10px] text-ink-faint">
                        {input.label}
                        {input.required ? " *" : ""}
                      </label>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {envFields.map((f) => (
                          <button
                            key={f.key}
                            type="button"
                            onClick={() =>
                              patch({
                                params: {
                                  ...(currentNode.params ?? {}),
                                  [input.key]: `{{${f.key}}}`,
                                },
                              })
                            }
                            className="rounded bg-card2 px-1.5 py-0.5 text-[10px] text-ink-soft hover:bg-accent/10"
                          >
                            {f.key}
                          </button>
                        ))}
                        {priorOutputs.map((k) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() =>
                              patch({
                                params: {
                                  ...(currentNode.params ?? {}),
                                  [input.key]: `{{${k}}}`,
                                },
                              })
                            }
                            className="rounded bg-card2 px-1.5 py-0.5 text-[10px] text-ink-soft hover:bg-accent/10"
                          >
                            {k}
                          </button>
                        ))}
                      </div>
                      <input
                        value={currentNode.params?.[input.key] ?? ""}
                        onChange={(e) =>
                          patch({
                            params: { ...(currentNode.params ?? {}), [input.key]: e.target.value },
                          })
                        }
                        placeholder={`{{${input.key}}}`}
                        className="mt-1 h-8 w-full rounded border border-line px-2 font-mono text-xs"
                      />
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        )}

        {node.kind === "tool" && (
          <div>
            <label className="text-xs text-ink-soft">Outil</label>
            <select
              value={node.toolId ?? "web_search"}
              onChange={(e) =>
                patch({ toolId: e.target.value as PlanNode["toolId"] })
              }
              className="mt-1 h-9 w-full rounded-lg border border-line px-2 text-sm"
            >
              {TOOLS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {node.kind === "condition" && (
          <>
            <div>
              <label className="text-xs text-ink-soft">Expression</label>
              <input
                value={node.expression ?? ""}
                onChange={(e) => patch({ expression: e.target.value })}
                className="mt-1 h-9 w-full rounded-lg border border-line px-2 font-mono text-sm"
              />
            </div>
            {outgoing.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-ink-soft">Branches sortantes</p>
                {outgoing.map((e) => (
                  <div key={e.id} className="flex items-center gap-2">
                    <span className="truncate text-[10px] text-ink-faint">{e.target}</span>
                    <input
                      value={e.label ?? ""}
                      onChange={(ev) => updateEdgeLabel(e.target, ev.target.value)}
                      placeholder="libellé (ex. si urgent)"
                      className="h-8 flex-1 rounded border border-line px-2 text-xs"
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {node.kind === "approval" && (
          <div>
            <label className="text-xs text-ink-soft">Message d&apos;approbation</label>
            <textarea
              value={node.description ?? node.prompt ?? ""}
              onChange={(e) => patch({ description: e.target.value })}
              rows={3}
              className="mt-1 w-full rounded-lg border border-line px-2 py-1 text-sm"
            />
          </div>
        )}

        <label className="flex items-center gap-2 text-xs text-ink">
          <input
            type="checkbox"
            checked={node.requiresApproval}
            onChange={(e) => patch({ requiresApproval: e.target.checked })}
          />
          Requiert approbation humaine
        </label>
      </div>

      <div className="border-t border-line p-3">
        <p className="mb-2 text-xs font-medium text-ink-soft">Ajouter après ce nœud</p>
        <div className="flex flex-wrap gap-1">
          {NODE_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setAddKind(k.id)}
              className={`rounded px-2 py-0.5 text-[10px] ${
                addKind === k.id ? "bg-accent text-white" : "bg-card2 text-ink-soft"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            const newNode = createDefaultNode(addKind, currentGraph.nodes.length, defaultModel);
            onGraphChange(addNode(currentGraph, newNode, currentNode.id));
          }}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-line py-2 text-xs text-ink-soft hover:border-accent"
        >
          <Plus className="h-3 w-3" />
          Insérer étape
        </button>
        <button
          type="button"
          onClick={() => {
            onGraphChange(removeNode(currentGraph, currentNode.id));
            onClose();
          }}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-destructive/30 py-2 text-xs text-destructive hover:bg-destructive/5"
        >
          <Trash2 className="h-3 w-3" />
          Supprimer ce nœud
        </button>
      </div>
    </div>
  );
}
