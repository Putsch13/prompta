"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import type { AgentStep } from "@/lib/agent/schema";

const MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "claude-sonnet-4-20250514",
  "claude-3-5-haiku-20241022",
  "gemini-2.0-flash",
  "mistral-large-latest",
];

const TOOLS = [
  { id: "web_search" as const, label: "Recherche web", params: ["query"] },
  { id: "http_fetch" as const, label: "HTTP fetch", params: ["url"] },
  { id: "file_read" as const, label: "Lecture fichier", params: [] },
];

interface Props {
  steps: AgentStep[];
  onChange: (steps: AgentStep[]) => void;
  defaultModel?: string;
}

export function StepEditor({ steps, onChange, defaultModel = "gpt-4o" }: Props) {
  function updateStep(index: number, step: AgentStep) {
    const next = [...steps];
    next[index] = step;
    onChange(next);
  }

  function removeStep(index: number) {
    onChange(steps.filter((_, i) => i !== index));
  }

  function moveStep(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function addLlmStep() {
    onChange([
      ...steps,
      {
        type: "llm",
        model: defaultModel,
        prompt: "Écrivez votre prompt ici. Utilisez {{variable}} et {{step_N_output}}.",
      },
    ]);
  }

  function addToolStep(tool: "web_search" | "http_fetch" | "file_read") {
    const def = TOOLS.find((t) => t.id === tool)!;
    const params: Record<string, string> = {};
    for (const p of def.params) params[p] = "";
    onChange([...steps, { type: "tool", tool, params }]);
  }

  return (
    <div className="space-y-4">
      {steps.length === 0 && (
        <p className="text-sm text-ink-soft">
          Ajoutez au moins une étape LLM ou outil pour votre agent.
        </p>
      )}

      {steps.map((step, i) => (
        <div key={i} className="rounded-xl border border-line bg-card2 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-ink-soft">
              Étape {i + 1} — {step.type === "llm" ? "LLM" : step.type === "tool" ? "Outil" : "Code"}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => moveStep(i, -1)}
                disabled={i === 0}
                className="rounded p-1 text-ink-faint hover:bg-card disabled:opacity-30"
                title="Monter"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => moveStep(i, 1)}
                disabled={i === steps.length - 1}
                className="rounded p-1 text-ink-faint hover:bg-card disabled:opacity-30"
                title="Descendre"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => removeStep(i)}
                className="rounded p-1 text-destructive hover:bg-red-50"
                title="Supprimer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {step.type === "llm" && (
            <div className="space-y-3">
              <select
                value={step.model}
                onChange={(e) => updateStep(i, { ...step, model: e.target.value })}
                className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm"
              >
                {MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <textarea
                value={step.prompt}
                onChange={(e) => updateStep(i, { ...step, prompt: e.target.value })}
                rows={6}
                className="w-full rounded-lg border border-line bg-card px-3 py-2 font-mono text-sm"
                placeholder="Prompt avec {{variables}} et {{step_0_output}}"
              />
            </div>
          )}

          {step.type === "tool" && (
            <div className="space-y-3">
              <select
                value={step.tool}
                onChange={(e) => {
                  const tool = e.target.value as "web_search" | "http_fetch" | "file_read";
                  const def = TOOLS.find((t) => t.id === tool)!;
                  const params: Record<string, string> = {};
                  for (const p of def.params) params[p] = step.params[p] ?? "";
                  updateStep(i, { type: "tool", tool, params });
                }}
                className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm"
              >
                {TOOLS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              {Object.entries(step.params).map(([key, val]) => (
                <div key={key}>
                  <label className="mb-1 block text-xs text-ink-soft">{key}</label>
                  <input
                    value={val}
                    onChange={(e) =>
                      updateStep(i, {
                        ...step,
                        params: { ...step.params, [key]: e.target.value },
                      })
                    }
                    className="h-10 w-full rounded-lg border border-line bg-card px-3 font-mono text-sm"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={addLlmStep}
          className="flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm hover:bg-card2"
        >
          <Plus className="h-4 w-4" /> Étape LLM
        </button>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => addToolStep(t.id)}
            className="flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm hover:bg-card2"
          >
            <Plus className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
