"use client";

import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from "lucide-react";
import { CatalogSingleSelect } from "@/components/builder/CatalogSingleSelect";
import { AI_MODELS } from "@/lib/catalogs";
import { CONNECTORS, type ConnectorAction } from "@/lib/connectors/registry";
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

function stepBadge(step: AgentStep): string {
  if (step.type === "llm") return "LLM";
  if (step.type === "tool") return TOOLS.find((t) => t.id === step.tool)?.badge ?? "Outil";
  if (step.type === "action") return CONNECTORS.find((c) => c.id === step.connector)?.label ?? "Action";
  return "Code";
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

  function addLlmStep() {
    onChange([...steps, { type: "llm", model: defaultModel, prompt: "" }]);
  }

  function addToolStep(tool: "web_search" | "http_fetch" | "file_read") {
    const params: Record<string, string> =
      tool === "web_search" ? { query: "" } : tool === "http_fetch" ? { url: "" } : {};
    onChange([...steps, { type: "tool", tool, params }]);
  }

  function addActionStep(connectorId: string, action: ConnectorAction) {
    const params: Record<string, string> = {};
    for (const input of action.inputs) params[input.key] = "";
    onChange([
      ...steps,
      { type: "action", connector: connectorId, action: action.id, params },
    ]);
  }

  return (
    <div className="space-y-4">
      {steps.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-card2 px-3 py-2 text-xs text-ink-soft">
          {steps.map((s, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-ink-faint">→</span>}
              <span className="rounded bg-card px-2 py-0.5 font-medium">
                {i + 1}. {stepBadge(s)}
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

      {steps.map((step, i) => {
        const textareaId = `step-prompt-${i}`;
        return (
          <div key={i} className="rounded-xl border border-line bg-card2 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="rounded-full bg-accent-light px-2.5 py-0.5 text-xs font-bold text-accent">
                Étape {i + 1} — {stepBadge(step)}
              </span>
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

            {step.type === "llm" && (
              <div className="space-y-3">
                <CatalogSingleSelect
                  catalog={AI_MODELS as { id: string; label: string; popular?: boolean; provider?: string }[]}
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
                    Array.from({ length: i }, (_, j) => (
                      <button
                        key={j}
                        type="button"
                        onClick={() =>
                          updateStep(i, {
                            ...step,
                            prompt: insertAtCursor(step.prompt, `{{step_${j}_output}}`, textareaId),
                          })
                        }
                        className="rounded border border-line px-2 py-1 text-xs hover:bg-card"
                      >
                        + Sortie étape {j + 1}
                      </button>
                    ))}
                </div>

                <textarea
                  id={textareaId}
                  value={step.prompt}
                  onChange={(e) => updateStep(i, { ...step, prompt: e.target.value })}
                  rows={6}
                  className="w-full rounded-lg border border-line bg-card px-3 py-2 font-mono text-sm"
                  placeholder="Décrivez ce que cette étape doit faire. Utilisez les boutons ci-dessus pour insérer des variables."
                />

                <p className="text-xs text-ink-faint">
                  Entrée : variables + sorties des étapes précédentes · Sortie : étape {i + 1}
                </p>
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
                    updateStep(i, { type: "tool", tool, params });
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
                    />
                  </div>
                ))}
              </div>
            )}

            {step.type === "action" && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-ink">
                  {CONNECTORS.find((c) => c.id === step.connector)?.label} —{" "}
                  {CONNECTORS.find((c) => c.id === step.connector)?.actions.find((a) => a.id === step.action)?.label}
                </p>
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
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={addLlmStep} className="flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm hover:bg-card2">
          <Plus className="h-4 w-4" /> Étape LLM
        </button>
        {TOOLS.map((t) => (
          <button key={t.id} type="button" onClick={() => addToolStep(t.id)} className="flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm hover:bg-card2">
            <Plus className="h-4 w-4" /> {t.label}
          </button>
        ))}
        {CONNECTORS.slice(0, 5).map((c) =>
          c.actions.slice(0, 1).map((action) => (
            <button
              key={`${c.id}-${action.id}`}
              type="button"
              onClick={() => addActionStep(c.id, action)}
              className="flex items-center gap-1 rounded-lg border border-accent/30 px-3 py-2 text-sm text-accent hover:bg-accent-light"
            >
              <Plus className="h-4 w-4" /> {c.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
