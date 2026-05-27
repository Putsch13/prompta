"use client";

import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from "lucide-react";
import { CatalogSingleSelect } from "@/components/builder/CatalogSingleSelect";
import { getGatewayModels } from "@/lib/catalogs";
import { CONNECTORS } from "@/lib/connectors/registry";
import type { AgentStep, BaseAgentStep, ParallelBranch } from "@/lib/agent/schema";

const TOOLS = [
  { id: "web_search" as const, label: "Recherche web" },
  { id: "http_fetch" as const, label: "HTTP fetch" },
  { id: "file_read" as const, label: "Lecture fichier" },
];

interface EnvFieldRef {
  key: string;
  label: string;
}

interface Props {
  branches: ParallelBranch[];
  onChange: (branches: ParallelBranch[]) => void;
  defaultModel?: string;
  envFields?: EnvFieldRef[];
}

function branchBadge(step: BaseAgentStep): string {
  if (step.type === "llm") return "LLM";
  if (step.type === "tool") return TOOLS.find((t) => t.id === step.tool)?.label ?? "Outil";
  if (step.type === "action") return step.action;
  return "Code";
}

export function ParallelBranchEditor({
  branches,
  onChange,
  defaultModel = "gpt-5.4",
  envFields = [],
}: Props) {
  function updateBranch(branchIdx: number, branch: ParallelBranch) {
    const next = [...branches];
    next[branchIdx] = branch;
    onChange(next);
  }

  function addBranch() {
    onChange([
      ...branches,
      {
        steps: [{ type: "llm", model: defaultModel, prompt: "", outputKey: "branch_output" }],
        outputKey: `branch_${branches.length}_output`,
      },
    ]);
  }

  function removeBranch(branchIdx: number) {
    onChange(branches.filter((_, i) => i !== branchIdx));
  }

  function updateBranchStep(branchIdx: number, stepIdx: number, step: BaseAgentStep) {
    const branch = branches[branchIdx];
    const steps = [...branch.steps];
    steps[stepIdx] = step;
    updateBranch(branchIdx, { ...branch, steps });
  }

  function addBranchStep(branchIdx: number, step: BaseAgentStep) {
    const branch = branches[branchIdx];
    updateBranch(branchIdx, { ...branch, steps: [...branch.steps, step] });
  }

  function removeBranchStep(branchIdx: number, stepIdx: number) {
    const branch = branches[branchIdx];
    updateBranch(branchIdx, {
      ...branch,
      steps: branch.steps.filter((_, i) => i !== stepIdx),
    });
  }

  function moveBranchStep(branchIdx: number, stepIdx: number, dir: -1 | 1) {
    const branch = branches[branchIdx];
    const target = stepIdx + dir;
    if (target < 0 || target >= branch.steps.length) return;
    const steps = [...branch.steps];
    [steps[stepIdx], steps[target]] = [steps[target], steps[stepIdx]];
    updateBranch(branchIdx, { ...branch, steps });
  }

  function duplicateBranchStep(branchIdx: number, stepIdx: number) {
    const branch = branches[branchIdx];
    const copy = JSON.parse(JSON.stringify(branch.steps[stepIdx])) as BaseAgentStep;
    const steps = [...branch.steps];
    steps.splice(stepIdx + 1, 0, copy);
    updateBranch(branchIdx, { ...branch, steps });
  }

  return (
    <div className="space-y-4">
      {branches.map((branch, branchIdx) => (
        <div key={branchIdx} className="rounded-lg border border-accent/20 bg-accent-light/30 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-accent">
              Branche {branchIdx + 1}
            </span>
            <div className="flex items-center gap-2">
              <input
                value={branch.outputKey ?? ""}
                onChange={(e) =>
                  updateBranch(branchIdx, { ...branch, outputKey: e.target.value || undefined })
                }
                className="h-7 w-40 rounded border border-line bg-card px-2 font-mono text-xs"
                placeholder="clé sortie branche"
              />
              {branches.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeBranch(branchIdx)}
                  className="rounded p-1 text-destructive hover:bg-red-50"
                  title="Supprimer la branche"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {branch.steps.map((step, stepIdx) => (
            <div key={stepIdx} className="mb-3 rounded-lg border border-line bg-card p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-ink-soft">
                  {stepIdx + 1}. {branchBadge(step)}
                </span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => moveBranchStep(branchIdx, stepIdx, -1)} disabled={stepIdx === 0} className="rounded p-1 disabled:opacity-30">
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => moveBranchStep(branchIdx, stepIdx, 1)} disabled={stepIdx === branch.steps.length - 1} className="rounded p-1 disabled:opacity-30">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => duplicateBranchStep(branchIdx, stepIdx)} className="rounded p-1 text-ink-faint">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => removeBranchStep(branchIdx, stepIdx)} className="rounded p-1 text-destructive" disabled={branch.steps.length <= 1}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="mb-2">
                <input
                  value={step.outputKey ?? ""}
                  onChange={(e) =>
                    updateBranchStep(branchIdx, stepIdx, { ...step, outputKey: e.target.value || undefined })
                  }
                  className="h-7 w-full rounded border border-line bg-card2 px-2 font-mono text-xs"
                  placeholder="outputKey"
                />
              </div>

              {step.type === "llm" && (
                <div className="space-y-2">
                  <CatalogSingleSelect
                    catalog={getGatewayModels() as { id: string; label: string; popular?: boolean; provider?: string }[]}
                    value={step.model}
                    onChange={(model) => updateBranchStep(branchIdx, stepIdx, { ...step, model })}
                    groupByKey="provider"
                    placeholder="Modèle…"
                  />
                  <div className="flex flex-wrap gap-1">
                    {envFields.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() =>
                          updateBranchStep(branchIdx, stepIdx, {
                            ...step,
                            prompt: `${step.prompt}{{${f.key}}}`,
                          })
                        }
                        className="rounded border border-line px-1.5 py-0.5 text-[10px]"
                      >
                        + {f.label || f.key}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={step.prompt}
                    onChange={(e) => updateBranchStep(branchIdx, stepIdx, { ...step, prompt: e.target.value })}
                    rows={4}
                    className="w-full rounded border border-line bg-card2 px-2 py-1.5 font-mono text-xs"
                    placeholder="Prompt de la branche…"
                  />
                </div>
              )}

              {step.type === "tool" && (
                <div className="space-y-2">
                  <select
                    value={step.tool}
                    onChange={(e) => {
                      const tool = e.target.value as "web_search" | "http_fetch" | "file_read";
                      const params: Record<string, string> =
                        tool === "web_search" ? { query: "" } : tool === "http_fetch" ? { url: "" } : {};
                      updateBranchStep(branchIdx, stepIdx, { type: "tool", tool, params, outputKey: step.outputKey });
                    }}
                    className="h-8 w-full rounded border border-line bg-card2 px-2 text-xs"
                  >
                    {TOOLS.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                  {Object.entries(step.params).map(([key, val]) => (
                    <input
                      key={key}
                      value={val}
                      onChange={(e) =>
                        updateBranchStep(branchIdx, stepIdx, {
                          ...step,
                          params: { ...step.params, [key]: e.target.value },
                        })
                      }
                      className="h-8 w-full rounded border border-line bg-card2 px-2 font-mono text-xs"
                      placeholder={key}
                    />
                  ))}
                </div>
              )}

              {step.type === "action" && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <select
                      value={step.connector}
                      onChange={(e) => {
                        const connector = e.target.value;
                        const c = CONNECTORS.find((x) => x.id === connector);
                        const action = c?.actions[0];
                        if (!action) return;
                        const params: Record<string, string> = {};
                        for (const input of action.inputs) params[input.key] = "";
                        updateBranchStep(branchIdx, stepIdx, {
                          type: "action",
                          connector,
                          action: action.id,
                          params,
                          outputKey: step.outputKey,
                        });
                      }}
                      className="h-8 rounded border border-line bg-card2 px-2"
                    >
                      {CONNECTORS.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                    <select
                      value={step.action}
                      onChange={(e) => {
                        const action = e.target.value;
                        const c = CONNECTORS.find((x) => x.id === step.connector);
                        const def = c?.actions.find((a) => a.id === action);
                        const params: Record<string, string> = {};
                        if (def) for (const input of def.inputs) params[input.key] = "";
                        updateBranchStep(branchIdx, stepIdx, { ...step, action, params });
                      }}
                      className="h-8 rounded border border-line bg-card2 px-2"
                    >
                      {CONNECTORS.find((c) => c.id === step.connector)?.actions.map((a) => (
                        <option key={a.id} value={a.id}>{a.label}</option>
                      ))}
                    </select>
                  </div>
                  {Object.entries(step.params).map(([key, val]) => (
                    <input
                      key={key}
                      value={val}
                      onChange={(e) =>
                        updateBranchStep(branchIdx, stepIdx, {
                          ...step,
                          params: { ...step.params, [key]: e.target.value },
                        })
                      }
                      className="h-8 w-full rounded border border-line bg-card2 px-2 font-mono text-xs"
                      placeholder={key}
                    />
                  ))}
                </div>
              )}

              {step.type === "code" && (
                <textarea
                  value={step.source}
                  onChange={(e) => updateBranchStep(branchIdx, stepIdx, { ...step, source: e.target.value })}
                  rows={5}
                  className="w-full rounded border border-line bg-gray-900 px-2 py-1.5 font-mono text-xs text-green-300"
                />
              )}
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                addBranchStep(branchIdx, {
                  type: "llm",
                  model: defaultModel,
                  prompt: "",
                  outputKey: `branch_${branchIdx}_step_${branch.steps.length}_output`,
                })
              }
              className="rounded border border-line px-2 py-1 text-xs hover:bg-card"
            >
              + LLM
            </button>
            <button
              type="button"
              onClick={() =>
                addBranchStep(branchIdx, {
                  type: "tool",
                  tool: "web_search",
                  params: { query: "" },
                  outputKey: `branch_${branchIdx}_step_${branch.steps.length}_output`,
                })
              }
              className="rounded border border-line px-2 py-1 text-xs hover:bg-card"
            >
              + Outil
            </button>
            <button
              type="button"
              onClick={() =>
                addBranchStep(branchIdx, {
                  type: "code",
                  language: "python",
                  source: "# code\nresult = {}\n",
                  outputKey: `branch_${branchIdx}_step_${branch.steps.length}_output`,
                })
              }
              className="rounded border border-line px-2 py-1 text-xs hover:bg-card"
            >
              + Code
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addBranch}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-accent/40 py-2 text-xs text-accent hover:bg-accent-light"
      >
        <Plus className="h-3.5 w-3.5" /> Ajouter une branche
      </button>
    </div>
  );
}

/** Met à jour une étape parallel dans un tableau d'étapes. */
export function updateParallelStep(step: Extract<AgentStep, { type: "parallel" }>, branches: ParallelBranch[]) {
  return { ...step, branches };
}
