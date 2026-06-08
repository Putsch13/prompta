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

/** Classes de la pastille du rail (anneau + fond) selon le statut. */
function statusDotClass(status: RunStepLog["status"]): string {
  switch (status) {
    case "success":
      return "border-green-500 bg-green-50";
    case "failed":
      return "border-red-500 bg-red-50";
    case "running":
      return "border-blue-500 bg-blue-50";
    case "skipped":
      return "border-line bg-card2";
    default:
      return "border-line bg-card";
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;
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

  const doneCount = steps.filter((s) => s.status === "success").length;

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold text-ink-soft">Logs d&apos;exécution</p>
        <span className="text-[10px] text-ink-faint">
          {doneCount}/{steps.length} étape(s) terminée(s)
        </span>
      </div>
      <ol className="relative space-y-1.5 pl-1">
        {/* rail vertical */}
        <span className="absolute bottom-3 left-[14px] top-3 w-px bg-line" aria-hidden />
        {steps.map((step) => {
          const output = previewText(step.outputPreview, 600);
          const input = previewText(step.inputPreview, 600);
          const isOpen = expanded === step.id;
          const hasDetails = Boolean(input || output || step.errorMessage);

          return (
            <li key={step.id} className="relative flex gap-3">
              <span
                className={`relative z-10 mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${statusDotClass(
                  step.status,
                )}`}
              >
                {statusIcon(step.status)}
              </span>
              <div
                className={`min-w-0 flex-1 rounded-xl border bg-card p-2.5 transition-colors ${
                  step.status === "failed" ? "border-red-200" : "border-line"
                }`}
              >
                <button
                  type="button"
                  onClick={() => hasDetails && setExpanded(isOpen ? null : step.id)}
                  className="flex w-full items-start gap-2 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-ink">
                        {step.label ?? `Étape ${step.stepIndex + 1}`}
                      </span>
                      <span className="rounded bg-line/80 px-1.5 py-0.5 text-[10px] font-medium text-ink-faint">
                        {step.stepType}
                      </span>
                      {step.model && (
                        <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                          {step.model}
                        </span>
                      )}
                      {step.actionSlug && (
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                          {step.actionSlug}
                        </span>
                      )}
                      {step.durationMs != null && (
                        <span className="ml-auto text-[10px] text-ink-faint">
                          {formatDuration(step.durationMs)}
                        </span>
                      )}
                    </div>
                    {step.errorMessage && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2 py-1">
                        {step.errorCode && (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700">
                            {step.errorCode}
                          </span>
                        )}
                        <span className="text-xs text-destructive">{step.errorMessage}</span>
                      </div>
                    )}
                  </div>
                </button>

                {isOpen && (input || output) && (
                  <div className="mt-2 space-y-2 border-t border-line pt-2">
                    {input && (
                      <div>
                        <p className="text-[10px] font-medium uppercase text-ink-faint">Entrée</p>
                        <pre className="mt-1 max-h-32 overflow-auto rounded bg-card2 p-2 text-[10px] whitespace-pre-wrap">
                          {input}
                        </pre>
                      </div>
                    )}
                    {output && (
                      <div>
                        <p className="text-[10px] font-medium uppercase text-ink-faint">Sortie</p>
                        <pre className="mt-1 max-h-32 overflow-auto rounded bg-card2 p-2 text-[10px] whitespace-pre-wrap">
                          {output}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
