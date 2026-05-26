"use client";

import { useEffect, useState } from "react";
import { Check, X, Loader2, SkipForward, Clock } from "lucide-react";

export interface RunStepLog {
  id: string;
  stepIndex: number;
  stepId: string | null;
  stepType: string;
  label: string | null;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  inputPreview: unknown;
  outputPreview: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  provider: string | null;
  model: string | null;
  toolSlug: string | null;
  actionSlug: string | null;
}

interface Props {
  runId: string;
  pollWhileRunning?: boolean;
  isRunning?: boolean;
}

function statusIcon(status: RunStepLog["status"]) {
  switch (status) {
    case "success":
      return <Check className="h-3.5 w-3.5 text-green-600" />;
    case "failed":
      return <X className="h-3.5 w-3.5 text-red-600" />;
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />;
    case "skipped":
      return <SkipForward className="h-3.5 w-3.5 text-ink-faint" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-ink-faint" />;
  }
}

function previewText(value: unknown, max = 200): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, max);
  try {
    return JSON.stringify(value, null, 2).slice(0, max);
  } catch {
    return String(value).slice(0, max);
  }
}

export function RunStepTimeline({ runId, pollWhileRunning = false, isRunning = false }: Props) {
  const [steps, setSteps] = useState<RunStepLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/run/agent/${runId}/steps`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setSteps(data.steps ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    if (!pollWhileRunning && !isRunning) return () => { cancelled = true; };

    const interval = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [runId, pollWhileRunning, isRunning]);

  if (loading && steps.length === 0) {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-ink-faint">
        <Loader2 className="h-3 w-3 animate-spin" /> Chargement des étapes…
      </div>
    );
  }

  if (steps.length === 0) return null;

  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="mb-2 text-xs font-medium text-ink-soft">Timeline des étapes</p>
      <ol className="space-y-2">
        {steps.map((step) => {
          const output = previewText(step.outputPreview);
          const input = previewText(step.inputPreview);
          const isOpen = expanded === step.id;

          return (
            <li key={step.id} className="rounded-lg border border-line bg-card p-2.5">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : step.id)}
                className="flex w-full items-start gap-2 text-left"
              >
                <span className="mt-0.5 shrink-0">{statusIcon(step.status)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-ink">
                      {step.label ?? `Étape ${step.stepIndex + 1}`}
                    </span>
                    <span className="rounded bg-line/80 px-1 py-0.5 text-[10px] text-ink-faint">
                      {step.stepType}
                    </span>
                    {step.model && (
                      <span className="rounded bg-accent/10 px-1 py-0.5 text-[10px] text-accent">
                        {step.model}
                      </span>
                    )}
                    {step.actionSlug && (
                      <span className="rounded bg-blue-50 px-1 py-0.5 text-[10px] text-blue-600">
                        {step.actionSlug}
                      </span>
                    )}
                    {step.durationMs != null && (
                      <span className="text-[10px] text-ink-faint">{step.durationMs} ms</span>
                    )}
                  </div>
                  {step.errorMessage && (
                    <p className="mt-1 text-xs text-destructive">{step.errorMessage}</p>
                  )}
                </div>
              </button>

              {isOpen && (input || output) && (
                <div className="mt-2 space-y-2 border-t border-line pt-2 pl-6">
                  {input && (
                    <div>
                      <p className="text-[10px] font-medium uppercase text-ink-faint">Entrée</p>
                      <pre className="mt-1 max-h-24 overflow-auto rounded bg-card2 p-2 text-[10px] whitespace-pre-wrap">
                        {input}
                      </pre>
                    </div>
                  )}
                  {output && (
                    <div>
                      <p className="text-[10px] font-medium uppercase text-ink-faint">Sortie</p>
                      <pre className="mt-1 max-h-24 overflow-auto rounded bg-card2 p-2 text-[10px] whitespace-pre-wrap">
                        {output}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
