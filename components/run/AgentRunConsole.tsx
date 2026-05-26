"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  Clock,
  Code,
  Loader2,
  MessageSquare,
  Search,
  SkipForward,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import type { RunStepLog } from "@/components/run/RunStepTimeline";
import type { StepTraceEntry } from "@/lib/agent/orchestrator";

type RunStatus = "pending" | "running" | "queued" | "completed" | "failed" | "suspended" | "awaiting_approval";

interface Props {
  runId?: string;
  status?: RunStatus | string | null;
  stepsCompleted?: number;
  totalSteps?: number;
  stepTrace?: StepTraceEntry[];
  pollWhileRunning?: boolean;
  title?: string;
}

function normalizeStatus(s: string | null | undefined): RunStatus {
  if (!s) return "pending";
  if (s === "checking") return "running";
  return s as RunStatus;
}

function stepIcon(type: string) {
  switch (type) {
    case "llm":
      return <MessageSquare className="h-4 w-4" />;
    case "tool":
      return <Search className="h-4 w-4" />;
    case "action":
      return <Zap className="h-4 w-4" />;
    case "code":
      return <Code className="h-4 w-4" />;
    default:
      return <Bot className="h-4 w-4" />;
  }
}

function statusBadge(status: RunStepLog["status"] | StepTraceEntry["status"]) {
  switch (status) {
    case "success":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
          <Check className="h-3 w-3" /> OK
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
          <X className="h-3 w-3" /> Erreur
        </span>
      );
    case "running":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
          <Loader2 className="h-3 w-3 animate-spin" /> En cours
        </span>
      );
    case "skipped":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
          <SkipForward className="h-3 w-3" /> Ignoré
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
          <Clock className="h-3 w-3" /> Attente
        </span>
      );
  }
}

function previewText(value: unknown, max = 600): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, max);
  try {
    return JSON.stringify(value, null, 2).slice(0, max);
  } catch {
    return String(value).slice(0, max);
  }
}

export function AgentRunConsole({
  runId,
  status,
  stepsCompleted = 0,
  totalSteps = 0,
  stepTrace = [],
  pollWhileRunning = false,
  title = "Console d'exécution",
}: Props) {
  const [dbSteps, setDbSteps] = useState<RunStepLog[]>([]);
  const [loading, setLoading] = useState(Boolean(runId));
  const [expanded, setExpanded] = useState<string | null>(null);

  const runStatus = normalizeStatus(status);
  const isActive = runStatus === "running" || runStatus === "pending" || runStatus === "queued";

  useEffect(() => {
    if (!runId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/run/agent/${runId}/steps`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setDbSteps(data.steps ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    if (!pollWhileRunning && !isActive) {
      return () => {
        cancelled = true;
      };
    }

    const interval = setInterval(load, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [runId, pollWhileRunning, isActive]);

  const displaySteps = useMemo(() => {
    if (dbSteps.length > 0) {
      return dbSteps.map((s) => ({
        id: s.id,
        index: s.stepIndex,
        type: s.stepType,
        label: s.label ?? `Étape ${s.stepIndex + 1}`,
        status: s.status,
        output: previewText(s.outputPreview),
        input: previewText(s.inputPreview, 300),
        durationMs: s.durationMs,
        model: s.model,
        actionSlug: s.actionSlug,
        error: s.errorMessage,
      }));
    }
    return stepTrace.map((s, i) => ({
      id: `trace-${i}`,
      index: s.stepIndex,
      type: s.stepType,
      label: s.label,
      status: s.status,
      output: s.outputPreview ?? null,
      input: null as string | null,
      durationMs: s.durationMs ?? null,
      model: s.model ?? null,
      actionSlug: s.actionSlug ?? null,
      error: null as string | null,
    }));
  }, [dbSteps, stepTrace]);

  const progressTotal = totalSteps || displaySteps.length || 1;
  const progressDone = stepsCompleted || displaySteps.filter((s) => s.status === "success").length;
  const progressPct = Math.min(100, Math.round((progressDone / progressTotal) * 100));

  const statusLabel =
    runStatus === "completed"
      ? "Terminé"
      : runStatus === "failed"
        ? "Échoué"
        : runStatus === "running"
          ? "Exécution en cours"
          : runStatus === "queued" || runStatus === "pending"
            ? "Démarrage…"
            : runStatus;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-card to-card2 shadow-sm">
      <div className="border-b border-line bg-[#0f1419] px-4 py-4 text-white sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sky-400" />
              <p className="text-sm font-semibold">{title}</p>
            </div>
            <p className="mt-1 text-xs text-white/70">
              {statusLabel}
              {progressTotal > 0 && (
                <span>
                  {" "}
                  · {progressDone}/{progressTotal} étape(s)
                </span>
              )}
            </p>
          </div>
          {isActive && (
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-sky-400" />
            </span>
          )}
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-700 ease-out"
            style={{ width: `${isActive && progressPct < 8 ? 8 : progressPct}%` }}
          />
        </div>
      </div>

      <div className="max-h-[min(60vh,520px)] overflow-y-auto p-4 sm:p-5">
        {loading && displaySteps.length === 0 ? (
          <div className="flex items-center gap-2 py-8 text-sm text-ink-soft">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement du travail de l&apos;agent…
          </div>
        ) : displaySteps.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-faint">
            {isActive ? "L'agent démarre ses étapes…" : "Aucune étape enregistrée pour ce run."}
          </p>
        ) : (
          <ol className="relative space-y-0">
            {displaySteps.map((step, i) => {
              const isOpen = expanded === step.id;
              const isLast = i === displaySteps.length - 1;

              return (
                <li key={step.id} className="relative flex gap-3 pb-6">
                  {!isLast && (
                    <span
                      className="absolute left-[15px] top-8 h-[calc(100%-8px)] w-px bg-line"
                      aria-hidden
                    />
                  )}
                  <div
                    className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                      step.status === "success"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : step.status === "failed"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : step.status === "running"
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-line bg-card text-ink-soft"
                    }`}
                  >
                    {stepIcon(step.type)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : step.id)}
                      className="flex w-full items-start justify-between gap-2 text-left"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-ink">
                            {step.index + 1}. {step.label}
                          </span>
                          {statusBadge(step.status as RunStepLog["status"])}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <span className="rounded bg-line/70 px-1.5 py-0.5 text-[10px] uppercase text-ink-faint">
                            {step.type}
                          </span>
                          {step.model && (
                            <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                              {step.model}
                            </span>
                          )}
                          {step.actionSlug && (
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">
                              {step.actionSlug}
                            </span>
                          )}
                          {step.durationMs != null && (
                            <span className="text-[10px] text-ink-faint">{step.durationMs} ms</span>
                          )}
                        </div>
                        {step.error && (
                          <p className="mt-1 text-xs text-destructive">{step.error}</p>
                        )}
                      </div>
                      {(step.output || step.input) && (
                        <ChevronDown
                          className={`mt-1 h-4 w-4 shrink-0 text-ink-faint transition ${isOpen ? "rotate-180" : ""}`}
                        />
                      )}
                    </button>

                    {isOpen && (step.input || step.output) && (
                      <div className="mt-3 space-y-2 rounded-xl border border-line bg-card p-3">
                        {step.input && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">
                              Entrée
                            </p>
                            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-ink-soft">
                              {step.input}
                            </pre>
                          </div>
                        )}
                        {step.output && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">
                              Sortie
                            </p>
                            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-ink">
                              {step.output}
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
        )}
      </div>
    </div>
  );
}
