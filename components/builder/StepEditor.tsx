"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Copy, Plus, Trash2, X, Zap, Code, MessageSquare, Search } from "lucide-react";
import { CatalogSingleSelect } from "@/components/builder/CatalogSingleSelect";
import { ComposioActionPicker } from "@/components/builder/ComposioActionPicker";
import { getGatewayModels } from "@/lib/catalogs";
import { CONNECTORS, type ConnectorAction } from "@/lib/connectors/registry";
import type { ComposioToolEntry } from "@/lib/composio/catalog";
import type { AgentStep } from "@/lib/agent/schema";

const TOOLS = [
  { id: "web_search" as const, label: "Recherche web", badge: "Recherche web" },
  { id: "http_fetch" as const, label: "HTTP fetch", badge: "HTTP" },
  { id: "file_read" as const, label: "Lecture fichier", badge: "Fichier" },
];

interface EnvFieldRef {
  key: string;
  label: string;
}

interface Props {
  steps: AgentStep[];
  onChange: (steps: AgentStep[]) => void;
  defaultModel?: string;
  envFields?: EnvFieldRef[];
}

type StepCategory = "llm" | "tool" | "action" | "code" | "condition" | "approval" | "retrieve" | "parallel";

function stepBadge(step: AgentStep): string {
  if (step.type === "llm") return "LLM";
  if (step.type === "tool") return TOOLS.find((t) => t.id === step.tool)?.badge ?? "Outil";
  if (step.type === "action") return CONNECTORS.find((c) => c.id === step.connector)?.label ?? step.connector;
  return "Code";
}

function stepIcon(type: StepCategory) {
  switch (type) {
    case "llm": return <MessageSquare className="h-4 w-4" />;
    case "tool": return <Search className="h-4 w-4" />;
    case "action": return <Zap className="h-4 w-4" />;
    case "code": return <Code className="h-4 w-4" />;
    case "condition": return <Search className="h-4 w-4" />;
    case "approval": return <Zap className="h-4 w-4" />;
    case "retrieve": return <Search className="h-4 w-4" />;
    case "parallel": return <Zap className="h-4 w-4" />;
  }
}

function insertAtCursor(current: string, insert: string, textareaId: string): string {
  const el = document.getElementById(textareaId) as HTMLTextAreaElement | null;
  if (!el) return current + insert;
  const start = el.selectionStart ?? current.length;
  const end = el.selectionEnd ?? current.length;
  return current.slice(0, start) + insert + current.slice(end);
}

export function StepEditor({
  steps,
  onChange,
  defaultModel = "gpt-5.4",
  envFields = [],
}: Props) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [addCategory, setAddCategory] = useState<StepCategory>("llm");

  function updateStep(index: number, step: AgentStep) {
    const next = [...steps];
    next[index] = step;
    onChange(next);
  }

  function removeStep(index: number) {
    onChange(steps.filter((_, i) => i !== index));
  }

  function duplicateStep(index: number) {
    const copy = JSON.parse(JSON.stringify(steps[index])) as AgentStep;
    const next = [...steps];
    next.splice(index + 1, 0, copy);
    onChange(next);
  }

  function moveStep(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function addStep(step: AgentStep) {
    onChange([...steps, step]);
    setShowAddModal(false);
  }

  function addLlmStep() {
    addStep({ type: "llm", model: defaultModel, prompt: "", outputKey: `step_${steps.length}_output` });
  }

  function addToolStep(tool: "web_search" | "http_fetch" | "file_read") {
    const params: Record<string, string> =
      tool === "web_search" ? { query: "" } : tool === "http_fetch" ? { url: "" } : {};
    addStep({ type: "tool", tool, params, outputKey: `step_${steps.length}_output` });
  }

  function addActionStep(connectorId: string, action: ConnectorAction) {
    const params: Record<string, string> = {};
    for (const input of action.inputs) params[input.key] = "";
    addStep({ type: "action", connector: connectorId, action: action.id, params, outputKey: `step_${steps.length}_output` });
  }

  function addComposioActionStep(toolkit: string, tool: ComposioToolEntry) {
    const params: Record<string, string> = {};
    for (const input of tool.inputs) params[input.key] = "";
    addStep({ type: "action", connector: toolkit, action: tool.slug, params, outputKey: `step_${steps.length}_output` });
  }

  function addCodeStep() {
    addStep({ type: "code", language: "python", source: "# Votre code ici\nresult = {}\n", outputKey: `step_${steps.length}_output` });
  }

  return (
    <div className="space-y-4">
      {/* Pipeline visualization */}
      {steps.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-card2 px-3 py-2 text-xs text-ink-soft">
          {steps.map((s, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-ink-faint">→</span>}
              <span className="flex items-center gap-1 rounded bg-card px-2 py-0.5 font-medium">
                {stepIcon(s.type)}
                {i + 1}. {stepBadge(s)}
                {s.outputKey && (
                  <span className="ml-1 font-mono text-[10px] text-ink-faint">{s.outputKey}</span>
                )}
              </span>
            </span>
          ))}
        </div>
      )}

      {steps.length === 0 && (
        <p className="text-sm text-ink-soft">
          Ajoutez au moins une étape LLM, Action ou outil pour votre agent.
        </p>
      )}

      {/* Step cards */}
      {steps.map((step, i) => {
        const textareaId = `step-prompt-${i}`;
        return (
          <div key={i} className="rounded-xl border border-line bg-card2 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-full bg-accent-light px-2.5 py-0.5 text-xs font-bold text-accent">
                  {stepIcon(step.type)}
                  Étape {i + 1} — {stepBadge(step)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} className="rounded p-1 disabled:opacity-30" title="Monter">
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="rounded p-1 disabled:opacity-30" title="Descendre">
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => duplicateStep(i)} className="rounded p-1 text-ink-faint hover:bg-card" title="Dupliquer">
                  <Copy className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => removeStep(i)} className="rounded p-1 text-destructive hover:bg-red-50" title="Supprimer">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* outputKey */}
            <div className="mb-3 flex items-center gap-2">
              <label className="text-xs text-ink-faint whitespace-nowrap">Clé de sortie :</label>
              <input
                value={step.outputKey ?? `step_${i}_output`}
                onChange={(e) => updateStep(i, { ...step, outputKey: e.target.value })}
                className="h-7 w-48 rounded border border-line bg-card px-2 font-mono text-xs"
                placeholder={`step_${i}_output`}
              />
            </div>

            {step.type === "llm" && (
              <div className="space-y-3">
                <CatalogSingleSelect
                  catalog={getGatewayModels() as { id: string; label: string; popular?: boolean; provider?: string }[]}
                  value={step.model}
                  onChange={(model) => updateStep(i, { ...step, model })}
                  groupByKey="provider"
                  placeholder="Rechercher un modèle…"
                />

                <div className="flex flex-wrap gap-2">
                  {envFields.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() =>
                        updateStep(i, {
                          ...step,
                          prompt: insertAtCursor(step.prompt, `{{${f.key}}}`, textareaId),
                        })
                      }
                      className="rounded border border-line px-2 py-1 text-xs hover:bg-card"
                    >
                      + {f.label || f.key}
                    </button>
                  ))}
                  {i > 0 &&
                    Array.from({ length: i }, (_, j) => {
                      const prevKey = steps[j].outputKey ?? `step_${j}_output`;
                      return (
                        <button
                          key={j}
                          type="button"
                          onClick={() =>
                            updateStep(i, {
                              ...step,
                              prompt: insertAtCursor(step.prompt, `{{${prevKey}}}`, textareaId),
                            })
                          }
                          className="rounded border border-accent/30 px-2 py-1 text-xs text-accent hover:bg-accent-light"
                        >
                          + {prevKey}
                        </button>
                      );
                    })}
                </div>

                <textarea
                  id={textareaId}
                  value={step.prompt}
                  onChange={(e) => updateStep(i, { ...step, prompt: e.target.value })}
                  rows={6}
                  className="w-full rounded-lg border border-line bg-card px-3 py-2 font-mono text-sm"
                  placeholder="Décrivez ce que cette étape doit faire. Utilisez les boutons ci-dessus pour insérer des variables."
                />
              </div>
            )}

            {step.type === "tool" && (
              <div className="space-y-3">
                <select
                  value={step.tool}
                  onChange={(e) => {
                    const tool = e.target.value as "web_search" | "http_fetch" | "file_read";
                    const params: Record<string, string> =
                      tool === "web_search" ? { query: "" } : tool === "http_fetch" ? { url: "" } : {};
                    updateStep(i, { type: "tool", tool, params, outputKey: step.outputKey });
                  }}
                  className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm"
                >
                  {TOOLS.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                {Object.entries(step.params).map(([key, val]) => (
                  <div key={key}>
                    <label className="mb-1 block text-xs text-ink-soft">{key}</label>
                    <input
                      value={val}
                      onChange={(e) =>
                        updateStep(i, { ...step, params: { ...step.params, [key]: e.target.value } })
                      }
                      className="h-10 w-full rounded-lg border border-line bg-card px-3 font-mono text-sm"
                      placeholder={`{{variable}} ou {{step_N_output}}`}
                    />
                  </div>
                ))}
              </div>
            )}

            {step.type === "action" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">{step.connector}</span>
                  <span className="text-xs text-ink-faint">→</span>
                  <span className="rounded bg-card px-2 py-0.5 font-mono text-xs text-ink">{step.action}</span>
                </div>
                {Object.entries(step.params).map(([key, val]) => (
                  <div key={key}>
                    <label className="mb-1 block text-xs text-ink-soft">{key}</label>
                    <input
                      value={val}
                      onChange={(e) =>
                        updateStep(i, { ...step, params: { ...step.params, [key]: e.target.value } })
                      }
                      className="h-10 w-full rounded-lg border border-line bg-card px-3 font-mono text-sm"
                      placeholder={`{{variable}} ou {{step_N_output}}`}
                    />
                  </div>
                ))}
              </div>
            )}

            {step.type === "code" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-ink-soft">
                  <Code className="h-3.5 w-3.5" />
                  Python (sandbox E2B)
                </div>
                <textarea
                  value={step.source}
                  onChange={(e) => updateStep(i, { ...step, source: e.target.value })}
                  rows={8}
                  className="w-full rounded-lg border border-line bg-gray-900 px-3 py-2 font-mono text-sm text-green-300"
                  placeholder="# Code Python exécuté dans un sandbox sécurisé"
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Add step button → modal */}
      <button
        type="button"
        onClick={() => { setShowAddModal(true); setAddCategory("llm"); }}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line py-3 text-sm text-ink-soft transition-colors hover:border-accent hover:text-accent"
      >
        <Plus className="h-4 w-4" /> Ajouter une étape
      </button>

      {/* Add step modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-line px-6 py-4">
              <h3 className="font-display text-lg font-bold text-ink">Ajouter une étape</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="rounded p-1 hover:bg-card2">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4">
            {/* Category tabs */}
            <div className="flex flex-wrap gap-2">
              {([
                { id: "llm", label: "LLM", icon: <MessageSquare className="h-3.5 w-3.5" /> },
                { id: "tool", label: "Outil", icon: <Search className="h-3.5 w-3.5" /> },
                { id: "action", label: "Action", icon: <Zap className="h-3.5 w-3.5" /> },
                { id: "code", label: "Code", icon: <Code className="h-3.5 w-3.5" /> },
              ] as const).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setAddCategory(cat.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    addCategory === cat.id
                      ? "bg-accent text-white"
                      : "border border-line text-ink hover:bg-card2"
                  }`}
                >
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>

            {/* Category content */}
            <div className="mt-4">
              {addCategory === "llm" && (
                <div>
                  <p className="text-sm text-ink-soft">Ajoutez un appel à un modèle IA (GPT, Claude, Gemini…)</p>
                  <button
                    type="button"
                    onClick={addLlmStep}
                    className="mt-3 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
                  >
                    <Plus className="h-4 w-4" /> Étape LLM
                  </button>
                </div>
              )}

              {addCategory === "tool" && (
                <div className="space-y-2">
                  <p className="text-sm text-ink-soft">Outils intégrés au runtime Prompta :</p>
                  {TOOLS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => addToolStep(t.id)}
                      className="flex w-full items-center gap-3 rounded-lg border border-line p-3 text-left transition-colors hover:border-accent hover:bg-accent-light"
                    >
                      <Search className="h-4 w-4 shrink-0 text-accent" />
                      <div>
                        <p className="text-sm font-medium text-ink">{t.label}</p>
                        <p className="text-xs text-ink-faint">{t.badge}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {addCategory === "action" && (
                <div className="space-y-3">
                  <p className="text-sm text-ink-soft">Actions depuis vos apps connectées :</p>

                  <div className="max-h-40 space-y-1 overflow-y-auto overscroll-contain">
                    {CONNECTORS.map((c) =>
                      c.actions.map((action) => (
                        <button
                          key={`${c.id}-${action.id}`}
                          type="button"
                          onClick={() => addActionStep(c.id, action)}
                          className="flex w-full items-center gap-3 rounded-lg border border-line p-2.5 text-left transition-colors hover:border-accent hover:bg-accent-light"
                        >
                          <Zap className="h-4 w-4 shrink-0 text-accent" />
                          <div>
                            <p className="text-sm font-medium text-ink">{c.label} → {action.label}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>

                  <div className="border-t border-line pt-3">
                    <p className="mb-2 text-xs font-medium text-ink-soft">Actions Composio (800+)</p>
                    <ComposioActionPicker onAdd={addComposioActionStep} inline />
                  </div>
                </div>
              )}

              {addCategory === "code" && (
                <div>
                  <p className="text-sm text-ink-soft">Exécutez du code Python dans un sandbox sécurisé (E2B).</p>
                  <button
                    type="button"
                    onClick={addCodeStep}
                    className="mt-3 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
                  >
                    <Code className="h-4 w-4" /> Étape code Python
                  </button>
                </div>
              )}
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
