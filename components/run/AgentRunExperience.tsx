"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Download,
  FileOutput,
  LayoutList,
  Loader2,
  Radio,
  X,
} from "lucide-react";
import { AgentRunConsole } from "@/components/run/AgentRunConsole";
import { ActionWorkspacePanel } from "@/components/run/ActionWorkspacePanel";
import type { StepTraceEntry } from "@/lib/agent/orchestrator";

type RunStatus = string;

interface DeliverableItem {
  id: string;
  kind: string;
  filename: string;
  mime_type: string;
  preview_text: string | null;
  size_bytes: number;
  created_at: string;
}

interface DisplayStep {
  id: string;
  index: number;
  type: string;
  label: string;
  status: string;
  output: string | null;
  actionSlug?: string | null;
}

interface Props {
  title: string;
  status: RunStatus | null;
  runId?: string | null;
  stepsCompleted?: number;
  totalSteps?: number;
  stepTrace?: StepTraceEntry[];
  errorMessage?: string | null;
  pollWhileRunning?: boolean;
  finalOutput?: string;
  onClose?: () => void;
  onApprove?: (approvalId: string) => Promise<void>;
  onRetry?: () => void;
  approvalId?: string | null;
}

function groupKey(step: DisplayStep): string {
  if (step.type === "action" && step.actionSlug) {
    const toolkit = step.actionSlug.split("_")[0]?.toLowerCase() ?? "action";
    return toolkit;
  }
  if (step.type === "tool") return step.label.replace(/^Outil\s/i, "") || "outil";
  if (step.type === "llm") return "ia";
  if (step.type === "approval") return "validation";
  return step.type;
}

function groupLabel(key: string): string {
  const labels: Record<string, string> = {
    ia: "Génération IA",
    web_search: "Recherche web",
    http_fetch: "HTTP",
    file_read: "Fichiers",
    validation: "Validations humaines",
    googlesheets: "Google Sheets",
    google_sheets: "Google Sheets",
    gmail: "Gmail",
    slack: "Slack",
    hubspot: "HubSpot",
    notion: "Notion",
    files: "Fichiers livrables",
  };
  return labels[key] ?? key.replace(/_/g, " ");
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

export function AgentRunExperience({
  title,
  status,
  runId,
  stepsCompleted = 0,
  totalSteps = 0,
  stepTrace = [],
  errorMessage,
  pollWhileRunning = false,
  finalOutput,
  onClose,
  onApprove,
  onRetry,
  approvalId,
}: Props) {
  const [view, setView] = useState<"live" | "workspace" | "deliverables">("live");
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [deliverables, setDeliverables] = useState<DeliverableItem[]>([]);
  const [loadingDeliverables, setLoadingDeliverables] = useState(false);

  const displaySteps: DisplayStep[] = useMemo(
    () =>
      stepTrace.map((s, i) => ({
        id: `trace-${i}`,
        index: s.stepIndex,
        type: s.stepType,
        label: s.label,
        status: s.status,
        output: s.outputPreview ?? null,
        actionSlug: s.actionSlug ?? null,
      })),
    [stepTrace]
  );

  const groups = useMemo(() => {
    const map = new Map<string, DisplayStep[]>();
    for (const step of displaySteps.filter((s) => s.status === "success" && s.output)) {
      const key = groupKey(step);
      const list = map.get(key) ?? [];
      list.push(step);
      map.set(key, list);
    }
    return map;
  }, [displaySteps]);

  const hasDeliverables = deliverables.length > 0 || groups.size > 0;

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;

    async function loadDeliverables() {
      setLoadingDeliverables(true);
      try {
        const res = await fetch(`/api/run/agent/${runId}/deliverables`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setDeliverables(data.deliverables ?? []);
        }
      } finally {
        if (!cancelled) setLoadingDeliverables(false);
      }
    }

    loadDeliverables();
    if (status === "completed" || status === "failed") {
      return () => {
        cancelled = true;
      };
    }

    const interval = setInterval(loadDeliverables, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [runId, status]);

  useEffect(() => {
    if (deliverables.length > 0) {
      setActiveGroup("files");
      return;
    }
    if (groups.size > 0 && !activeGroup) {
      setActiveGroup(Array.from(groups.keys())[0]);
    }
  }, [groups, activeGroup, deliverables.length]);

  const workspaceStep = useMemo(() => {
    const fromTrace = [...displaySteps].reverse().find(
      (s) => s.status === "running" || (s.status === "success" && s.output)
    );
    return fromTrace ?? null;
  }, [displaySteps]);

  const isActive =
    status === "running" ||
    status === "pending" ||
    status === "queued" ||
    status === "checking";

  useEffect(() => {
    if (isActive && workspaceStep?.type === "action" && view === "live") {
      setView("workspace");
    }
  }, [isActive, workspaceStep?.type, view]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0f14] text-white">
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold">{title}</p>
          <p className="text-xs text-white/60">
            {isActive ? "Agent en cours…" : status === "completed" ? "Terminé" : status === "failed" ? "Échoué" : status ?? "—"}
            {totalSteps > 0 && ` · ${stepsCompleted}/${totalSteps} étapes`}
            {deliverables.length > 0 && ` · ${deliverables.length} livrable(s)`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView("live")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
              view === "live" ? "bg-sky-500 text-white" : "bg-white/10 text-white/80 hover:bg-white/15"
            }`}
          >
            <Radio className="h-3.5 w-3.5" /> Live
          </button>
          <button
            type="button"
            onClick={() => setView("workspace")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
              view === "workspace" ? "bg-violet-500 text-white" : "bg-white/10 text-white/80 hover:bg-white/15"
            }`}
          >
            <Bot className="h-3.5 w-3.5" /> Apps
          </button>
          <button
            type="button"
            onClick={() => setView("deliverables")}
            disabled={!hasDeliverables && !loadingDeliverables}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
              view === "deliverables"
                ? "bg-emerald-500 text-white"
                : "bg-white/10 text-white/80 hover:bg-white/15"
            }`}
          >
            <FileOutput className="h-3.5 w-3.5" /> Livrables
            {deliverables.length > 0 && (
              <span className="rounded-full bg-white/20 px-1.5 text-[10px]">{deliverables.length}</span>
            )}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      {status === "awaiting_approval" && approvalId && onApprove && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 sm:px-6">
          <p className="text-sm font-medium text-amber-100">Validation humaine requise</p>
          <p className="mt-1 text-xs text-amber-100/80">
            L&apos;agent attend votre accord pour continuer.
          </p>
          <button
            type="button"
            disabled={approving}
            onClick={async () => {
              setApproving(true);
              try {
                await onApprove(approvalId);
              } finally {
                setApproving(false);
              }
            }}
            className="mt-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-amber-950 disabled:opacity-50"
          >
            {approving ? <Loader2 className="inline h-4 w-4 animate-spin" /> : "Approuver et continuer"}
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {view === "live" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-6">
            <AgentRunConsole
              runId={runId ?? undefined}
              status={status}
              stepsCompleted={stepsCompleted}
              totalSteps={totalSteps}
              stepTrace={stepTrace}
              pollWhileRunning={pollWhileRunning}
              title="Exécution en direct"
              errorMessage={errorMessage}
              onRetry={onRetry}
            />
            {finalOutput && status === "completed" && (
              <div className="mt-4 shrink-0 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <p className="text-xs font-bold uppercase text-emerald-300">Livrable final</p>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-sm text-emerald-50">
                  {finalOutput}
                </pre>
              </div>
            )}
          </div>
        ) : view === "workspace" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 sm:flex-row sm:p-6">
            <aside className="w-full shrink-0 sm:w-56">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-white/50">Étapes apps</p>
              <nav className="flex gap-2 overflow-x-auto sm:flex-col sm:overflow-visible">
                {displaySteps
                  .filter((s) => s.type === "action" || s.type === "tool" || s.type === "llm")
                  .map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setActiveGroup(`step-${s.index}`)}
                      className={`shrink-0 rounded-lg px-3 py-2 text-left text-xs sm:w-full ${
                        (activeGroup === `step-${s.index}` || workspaceStep?.id === s.id)
                          ? "bg-violet-500/30 text-white"
                          : "bg-white/5 text-white/70 hover:bg-white/10"
                      }`}
                    >
                      {s.label}
                      <span className="ml-1 text-white/40">#{s.index + 1}</span>
                    </button>
                  ))}
              </nav>
            </aside>
            <div className="min-h-0 flex-1">
              <ActionWorkspacePanel
                step={
                  activeGroup?.startsWith("step-")
                    ? displaySteps.find((s) => `step-${s.index}` === activeGroup) ?? workspaceStep
                    : workspaceStep
                }
                isLive={isActive}
              />
            </div>
          </div>
        ) : (
          <>
            <aside className="w-full shrink-0 border-b border-white/10 lg:w-64 lg:border-b-0 lg:border-r">
              <p className="flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white/50">
                <LayoutList className="h-3.5 w-3.5" /> Livrables
              </p>
              <nav className="flex gap-1 overflow-x-auto px-2 pb-3 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-6">
                {deliverables.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveGroup("files")}
                    className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm lg:w-full ${
                      activeGroup === "files"
                        ? "bg-white/15 text-white"
                        : "text-white/70 hover:bg-white/10"
                    }`}
                  >
                    <span className="font-medium">Fichiers</span>
                    <span className="ml-2 text-xs text-white/40">{deliverables.length}</span>
                  </button>
                )}
                {Array.from(groups.entries()).map(([key, steps]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveGroup(key)}
                    className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm lg:w-full ${
                      activeGroup === key
                        ? "bg-white/15 text-white"
                        : "text-white/70 hover:bg-white/10"
                    }`}
                  >
                    <span className="font-medium">{groupLabel(key)}</span>
                    <span className="ml-2 text-xs text-white/40">{steps.length}</span>
                  </button>
                ))}
              </nav>
            </aside>
            <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              {loadingDeliverables && deliverables.length === 0 ? (
                <div className="flex items-center gap-2 py-12 text-sm text-white/50">
                  <Loader2 className="h-4 w-4 animate-spin" /> Chargement des livrables…
                </div>
              ) : activeGroup === "files" && deliverables.length > 0 ? (
                <div className="space-y-3">
                  <h2 className="flex items-center gap-2 font-display text-xl font-bold">
                    <FileOutput className="h-5 w-5 text-emerald-400" />
                    Fichiers livrables
                  </h2>
                  {deliverables.map((d) => (
                    <article
                      key={d.id}
                      className="rounded-xl border border-white/10 bg-white/5 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-white/90">{d.filename}</p>
                          <p className="mt-0.5 text-xs text-white/40">
                            {d.kind} · {formatBytes(d.size_bytes)}
                          </p>
                        </div>
                        <a
                          href={`/api/run/agent/${runId}/deliverables/${d.id}/download`}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/30"
                        >
                          <Download className="h-3.5 w-3.5" /> Télécharger
                        </a>
                      </div>
                      {d.preview_text && (
                        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs leading-relaxed text-white/70">
                          {d.preview_text}
                        </pre>
                      )}
                    </article>
                  ))}
                </div>
              ) : activeGroup && groups.get(activeGroup) ? (
                <div className="space-y-4">
                  <h2 className="flex items-center gap-2 font-display text-xl font-bold">
                    <Bot className="h-5 w-5 text-sky-400" />
                    {groupLabel(activeGroup)}
                  </h2>
                  {groups.get(activeGroup)!.map((step) => (
                    <article
                      key={step.id}
                      className="rounded-xl border border-white/10 bg-white/5 p-4"
                    >
                      <p className="text-sm font-medium text-white/90">
                        Étape {step.index + 1} — {step.label}
                      </p>
                      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs leading-relaxed text-white/80">
                        {step.output}
                      </pre>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="py-12 text-center text-sm text-white/50">
                  Les livrables apparaîtront ici à la fin du run.
                </p>
              )}
            </main>
          </>
        )}
      </div>
    </div>
  );
}
