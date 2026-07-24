"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { HumanApprovalModal, type ApprovalDetails } from "@/components/run/HumanApprovalModal";
import type { StepTraceEntry } from "@/lib/agent/orchestrator";

export type RunStatus = string;

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
  /** Libellés des étapes du manifeste (affichés avant les logs). */
  plannedLabels?: string[];
  stepTrace?: StepTraceEntry[];
  errorMessage?: string | null;
  pollWhileRunning?: boolean;
  finalOutput?: string;
  onClose?: () => void;
  onApprove?: (approvalId: string, modifiedContent?: string) => Promise<void>;
  onReject?: (approvalId: string) => Promise<void>;
  approvalId?: string | null;
  approvalDetails?: ApprovalDetails | null;
  onRetry?: () => void;
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
    web_fetch: "Lecture de page",
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
  plannedLabels = [],
  stepTrace = [],
  errorMessage,
  pollWhileRunning = false,
  finalOutput,
  onClose,
  onApprove,
  onReject,
  onRetry,
  approvalId,
  approvalDetails,
}: Props) {
  const [view, setView] = useState<"live" | "workspace" | "deliverables">("live");
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [deliverables, setDeliverables] = useState<DeliverableItem[]>([]);
  const [loadingDeliverables, setLoadingDeliverables] = useState(false);
  // Étapes réelles depuis la base (run traité par le worker) : sans ça la vue
  // Apps restait vide pour un run async (stepTrace n'est rempli que par le
  // wizard en mode sync legacy).
  const [dbSteps, setDbSteps] = useState<DisplayStep[]>([]);

  const showApprovalModal =
    status === "awaiting_approval" && Boolean(approvalId) && Boolean(onApprove);

  const activeForSteps =
    status === "running" || status === "pending" || status === "queued" || status === "checking";

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    async function loadSteps() {
      try {
        const res = await fetch(`/api/run/agent/${runId}/steps`);
        if (!res.ok || cancelled) return;
        const d = await res.json();
        const steps = (d.steps ?? []) as Array<{
          id: string;
          stepIndex: number;
          stepType: string;
          label: string | null;
          status: string;
          outputPreview: unknown;
          actionSlug: string | null;
        }>;
        setDbSteps(
          steps.map((s) => ({
            id: s.id,
            index: s.stepIndex,
            type: s.stepType,
            label: s.label ?? `Étape ${s.stepIndex + 1}`,
            status: s.status,
            output:
              typeof s.outputPreview === "string"
                ? s.outputPreview
                : s.outputPreview != null
                  ? JSON.stringify(s.outputPreview, null, 2)
                  : null,
            actionSlug: s.actionSlug,
          })),
        );
      } catch {
        /* best-effort */
      }
    }
    loadSteps();
    if (!activeForSteps) {
      // cleanup quand même : un fetch en vol ne doit pas setState après unmount
      return () => {
        cancelled = true;
      };
    }
    const t = setInterval(loadSteps, 1500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [runId, activeForSteps]);

  const displaySteps: DisplayStep[] = useMemo(() => {
    // Les étapes DB (worker) priment ; fallback sur stepTrace (wizard sync).
    if (dbSteps.length > 0) return dbSteps;
    return stepTrace.map((s, i) => ({
      id: `trace-${i}`,
      index: s.stepIndex,
      type: s.stepType,
      label: s.label,
      status: s.status,
      output: s.outputPreview ?? null,
      actionSlug: s.actionSlug ?? null,
    }));
  }, [dbSteps, stepTrace]);

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
    // Sélection par défaut uniquement : ne jamais écraser un onglet choisi par
    // l'utilisateur (sinon chaque refresh le ramenait de force sur « files »).
    if (activeGroup) return;
    if (deliverables.length > 0) {
      setActiveGroup("files");
      return;
    }
    if (groups.size > 0) {
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

  // Bascule automatique vers « Apps » UNE seule fois : sans le ref, cliquer
  // l'onglet « Live » pendant une action renvoyait instantanément sur
  // « Apps » (le bouton paraissait cassé).
  const autoSwitchedRef = useRef(false);
  useEffect(() => {
    if (
      isActive &&
      workspaceStep?.type === "action" &&
      view === "live" &&
      !autoSwitchedRef.current
    ) {
      autoSwitchedRef.current = true;
      setView("workspace");
    }
  }, [isActive, workspaceStep?.type, view]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg text-ink">
      <HumanApprovalModal
        runId={runId ?? undefined}
        open={showApprovalModal}
        approval={
          approvalDetails ??
          (approvalId
            ? { id: approvalId, preview: "", label: "Validation humaine requise", stepIndex: stepsCompleted }
            : null)
        }
        onApprove={async (id, content) => {
          if (!onApprove) return;
          await onApprove(id, content);
        }}
        onReject={async (id) => {
          if (onReject) await onReject(id);
        }}
      />
      <header className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold">{title}</p>
          <p className="text-xs text-ink-soft">
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
              view === "live" ? "bg-accent font-semibold text-accent-ink shadow-glow-sm" : "bg-card2 text-ink-soft hover:bg-line/60 hover:text-ink"
            }`}
          >
            <Radio className="h-3.5 w-3.5" /> Live
          </button>
          <button
            type="button"
            onClick={() => setView("workspace")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
              view === "workspace" ? "bg-accent font-semibold text-accent-ink shadow-glow-sm" : "bg-card2 text-ink-soft hover:bg-line/60 hover:text-ink"
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
                ? "bg-success font-semibold text-accent-ink"
                : "bg-card2 text-ink-soft hover:bg-line/60 hover:text-ink"
            }`}
          >
            <FileOutput className="h-3.5 w-3.5" /> Livrables
            {deliverables.length > 0 && (
              <span className="rounded-full bg-black/20 px-1.5 font-mono text-[10px]">{deliverables.length}</span>
            )}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-ink-soft hover:bg-card2 hover:text-ink"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {view === "live" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-6">
            <AgentRunConsole
              runId={runId ?? undefined}
              status={status}
              stepsCompleted={stepsCompleted}
              totalSteps={totalSteps}
              plannedLabels={plannedLabels}
              stepTrace={stepTrace}
              pollWhileRunning={pollWhileRunning}
              title="Exécution en direct"
              errorMessage={errorMessage}
              onRetry={onRetry}
            />
            {finalOutput && status === "completed" && (
              <div className="mt-4 shrink-0 rounded-xl border border-success/30 bg-success/10 p-4">
                <p className="hud-label !text-success">Livrable final</p>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-sm text-ink">
                  {finalOutput}
                </pre>
              </div>
            )}
          </div>
        ) : view === "workspace" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 sm:flex-row sm:p-6">
            <aside className="w-full shrink-0 sm:w-56">
              <p className="hud-label mb-2">Étapes apps</p>
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
                          ? "border border-accent/40 bg-accent/10 text-accent"
                          : "border border-line bg-card text-ink-soft hover:border-accent/30 hover:bg-card2"
                      }`}
                    >
                      {s.label}
                      <span className="ml-1 font-mono text-ink-faint">#{s.index + 1}</span>
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
            <aside className="w-full shrink-0 border-b border-line lg:w-64 lg:border-b-0 lg:border-r">
              <p className="hud-label flex items-center gap-2 px-4 py-3">
                <LayoutList className="h-3.5 w-3.5" /> Livrables
              </p>
              <nav className="flex gap-1 overflow-x-auto px-2 pb-3 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-6">
                {deliverables.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveGroup("files")}
                    className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm lg:w-full ${
                      activeGroup === "files"
                        ? "bg-accent/10 text-accent"
                        : "text-ink-soft hover:bg-card2 hover:text-ink"
                    }`}
                  >
                    <span className="font-medium">Fichiers</span>
                    <span className="ml-2 font-mono text-xs text-ink-faint">{deliverables.length}</span>
                  </button>
                )}
                {Array.from(groups.entries()).map(([key, steps]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveGroup(key)}
                    className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm lg:w-full ${
                      activeGroup === key
                        ? "bg-accent/10 text-accent"
                        : "text-ink-soft hover:bg-card2 hover:text-ink"
                    }`}
                  >
                    <span className="font-medium">{groupLabel(key)}</span>
                    <span className="ml-2 font-mono text-xs text-ink-faint">{steps.length}</span>
                  </button>
                ))}
              </nav>
            </aside>
            <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              {loadingDeliverables && deliverables.length === 0 ? (
                <div className="flex items-center gap-2 py-12 text-sm text-ink-soft">
                  <Loader2 className="h-4 w-4 animate-spin" /> Chargement des livrables…
                </div>
              ) : activeGroup === "files" && deliverables.length > 0 ? (
                <div className="space-y-3">
                  <h2 className="flex items-center gap-2 font-display text-xl font-bold">
                    <FileOutput className="h-5 w-5 text-success" />
                    Fichiers livrables
                  </h2>
                  {deliverables.map((d) => (
                    <article
                      key={d.id}
                      className="hud-card p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{d.filename}</p>
                          <p className="mt-0.5 font-mono text-xs text-ink-faint">
                            {d.kind} · {formatBytes(d.size_bytes)}
                          </p>
                        </div>
                        <a
                          href={`/api/run/agent/${runId}/deliverables/${d.id}/download`}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-medium text-success hover:bg-success/20"
                        >
                          <Download className="h-3.5 w-3.5" /> Télécharger
                        </a>
                      </div>
                      {d.preview_text && (
                        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs leading-relaxed text-ink-soft">
                          {d.preview_text}
                        </pre>
                      )}
                    </article>
                  ))}
                </div>
              ) : activeGroup && groups.get(activeGroup) ? (
                <div className="space-y-4">
                  <h2 className="flex items-center gap-2 font-display text-xl font-bold">
                    <Bot className="h-5 w-5 text-accent" />
                    {groupLabel(activeGroup)}
                  </h2>
                  {groups.get(activeGroup)!.map((step) => (
                    <article
                      key={step.id}
                      className="hud-card p-4"
                    >
                      <p className="text-sm font-medium text-ink">
                        Étape {step.index + 1} — {step.label}
                      </p>
                      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs leading-relaxed text-ink-soft">
                        {step.output}
                      </pre>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="py-12 text-center text-sm text-ink-faint">
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
