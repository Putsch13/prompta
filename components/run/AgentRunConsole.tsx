"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  Clock,
  ClipboardCopy,
  Code,
  GitBranch,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  SkipForward,
  Sparkles,
  Timer,
  X,
  Zap,
} from "lucide-react";
import type { RunStepLog } from "@/components/run/RunStepTimeline";
import type { StepTraceEntry } from "@/lib/agent/orchestrator";
import { RunDebugAssistant } from "@/components/run/RunDebugAssistant";
import { HumanApprovalModal, type ApprovalDetails } from "@/components/run/HumanApprovalModal";

type RunStatus = "pending" | "running" | "queued" | "completed" | "failed" | "suspended" | "awaiting_approval";

interface Props {
  runId?: string;
  status?: RunStatus | string | null;
  stepsCompleted?: number;
  totalSteps?: number;
  /** Libellés des étapes prévues (manifeste) — remplace « Étape N » avant les logs. */
  plannedLabels?: string[];
  stepTrace?: StepTraceEntry[];
  pollWhileRunning?: boolean;
  title?: string;
  errorMessage?: string | null;
  onRetry?: () => void;
  /** Affiche l'assistant de debug IA quand le run a échoué (défaut: true). */
  showDebugAssistant?: boolean;
}

type DisplayStep = {
  id: string;
  index: number;
  type: string;
  label: string;
  status: string;
  output: string | null;
  input: string | null;
  durationMs: number | null;
  model: string | null;
  actionSlug: string | null;
  error: string | null;
  simulated?: boolean;
  /** Sous-étape d'une branche parallèle (index encodé parent*100 + branche*10 + pos). */
  sub?: { parent: number; branch: number; pos: number };
  /** Numéro affiché ("3" ou "3.1.2" pour une sous-étape). */
  displayNo?: string;
};

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
    case "parallel":
      return <GitBranch className="h-4 w-4" />;
    default:
      return <Bot className="h-4 w-4" />;
  }
}

function statusBadge(status: string) {
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

function mapDbStep(s: RunStepLog): DisplayStep {
  return {
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
  };
}

function mapTraceStep(s: StepTraceEntry, i: number): DisplayStep {
  return {
    id: `trace-${i}`,
    index: s.stepIndex,
    type: s.stepType,
    label: s.label,
    status: s.status,
    output: s.outputPreview ?? null,
    input: null,
    durationMs: s.durationMs ?? null,
    model: s.model ?? null,
    actionSlug: s.actionSlug ?? null,
    error: s.errorMessage ?? (s.status === "failed" ? s.outputPreview ?? null : null),
    simulated: s.simulated ?? s.outputPreview?.includes("[APERÇU") ?? false,
  };
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return "<1s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m${rem > 0 ? ` ${rem}s` : ""}`;
}

export function AgentRunConsole({
  runId,
  status,
  stepsCompleted = 0,
  totalSteps = 0,
  plannedLabels = [],
  stepTrace = [],
  pollWhileRunning = false,
  title = "Console d'exécution",
  errorMessage = null,
  onRetry,
  showDebugAssistant = true,
}: Props) {
  const [dbSteps, setDbSteps] = useState<RunStepLog[]>([]);
  const [liveCompleted, setLiveCompleted] = useState(stepsCompleted);
  const [loading, setLoading] = useState(Boolean(runId));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [heartbeatAt, setHeartbeatAt] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [approval, setApproval] = useState<ApprovalDetails | null>(null);
  // L'utilisateur a fermé la modale sans décider — on garde la donnée pour
  // pouvoir la rouvrir via la bannière « Répondre ».
  const [modalDismissed, setModalDismissed] = useState(false);
  // Bump pour relancer le polling/stream après une décision d'approbation
  // (le stream SSE se ferme sur `awaiting_approval`).
  const [reloadKey, setReloadKey] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  async function cancelRun() {
    if (!runId) return;
    setCancelling(true);
    try {
      await fetch(`/api/run/agent/${runId}/cancel`, { method: "POST" });
    } catch {
      /* best-effort */
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyApproval(run: any) {
    if (run?.status === "awaiting_approval" && run?.approval) {
      setApproval((prev) => {
        // Nouvelle demande d'approbation → on rouvre la modale.
        if (prev?.id !== run.approval.id) setModalDismissed(false);
        return {
          id: run.approval.id,
          label: run.approval.label,
          preview: run.approval.preview,
          stepIndex: run.approval.step_index,
        };
      });
    } else if (run?.status !== "awaiting_approval") {
      setApproval(null);
    }
  }

  async function handleApprove(approvalId: string, modifiedContent: string) {
    if (!runId) return;
    await fetch(`/api/run/agent/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId, decision: "approved", modifiedContent }),
    });
    setApproval(null);
    setLiveStatus("running");
    setReloadKey((k) => k + 1);
  }

  async function handleReject(approvalId: string) {
    if (!runId) return;
    await fetch(`/api/run/agent/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId, decision: "rejected" }),
    });
    setApproval(null);
    setLiveStatus("failed");
    setReloadKey((k) => k + 1);
  }

  async function copyReport() {
    const report = dbSteps.map((s) => ({
      index: s.stepIndex,
      label: s.label,
      type: s.stepType,
      status: s.status,
      model: s.model,
      actionSlug: s.actionSlug,
      durationMs: s.durationMs,
      errorCode: s.errorCode,
      errorMessage: s.errorMessage,
    }));
    try {
      await navigator.clipboard.writeText(JSON.stringify({ runId, report }, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard indisponible */
    }
  }

  const TERMINAL = new Set(["completed", "failed", "suspended", "cancelled", "timeout"]);
  const runStatus = normalizeStatus(liveStatus ?? status);
  const isActive =
    !TERMINAL.has(runStatus) &&
    (pollWhileRunning ||
      runStatus === "running" ||
      runStatus === "pending" ||
      runStatus === "queued" ||
      runStatus === "awaiting_approval");

  useEffect(() => {
    setLiveCompleted(stepsCompleted);
  }, [stepsCompleted]);

  useEffect(() => {
    setLiveStatus(null);
  }, [runId, status]);

  useEffect(() => {
    if (!runId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadOnce() {
      try {
        const [stepsRes, runRes] = await Promise.all([
          fetch(`/api/run/agent/${runId}/steps`),
          fetch(`/api/run/agent/${runId}`),
        ]);
        if (stepsRes.ok) {
          const data = await stepsRes.json();
          if (!cancelled) setDbSteps(data.steps ?? []);
        }
        if (runRes.ok) {
          const run = await runRes.json();
          if (!cancelled) {
            if (run.status) setLiveStatus(run.status === "pending" ? "queued" : run.status);
            if (run.steps_completed != null) setLiveCompleted(run.steps_completed);
            if (run.started_at) setStartedAt(run.started_at);
            if (run.heartbeat_at) setHeartbeatAt(run.heartbeat_at);
            applyApproval(run);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadOnce();

    const useStream = pollWhileRunning || isActive;
    if (!useStream) {
      return () => {
        cancelled = true;
      };
    }

    let es: EventSource | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    try {
      es = new EventSource(`/api/run/agent/${runId}/stream`);
      es.addEventListener("run", (ev) => {
        if (cancelled) return;
        try {
          const run = JSON.parse((ev as MessageEvent).data);
          if (run.status) setLiveStatus(run.status === "pending" ? "queued" : run.status);
          if (run.steps_completed != null) setLiveCompleted(run.steps_completed);
          if (run.started_at) setStartedAt(run.started_at);
          if (run.heartbeat_at) setHeartbeatAt(run.heartbeat_at);
          applyApproval(run);
        } catch {
          // ignore malformed SSE
        }
      });
      es.addEventListener("steps", (ev) => {
        if (cancelled) return;
        try {
          const data = JSON.parse((ev as MessageEvent).data);
          setDbSteps(data.steps ?? []);
        } catch {
          // ignore
        }
      });
      es.onerror = () => {
        es?.close();
        es = null;
        if (!pollInterval && !cancelled) {
          pollInterval = setInterval(loadOnce, 800);
        }
      };
    } catch {
      pollInterval = setInterval(loadOnce, 800);
    }

    return () => {
      cancelled = true;
      es?.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [runId, pollWhileRunning, isActive, reloadKey]);

  useEffect(() => {
    if (!startedAt || !isActive) return;
    const start = new Date(startedAt).getTime();
    setElapsed(Date.now() - start);
    const timer = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(timer);
  }, [startedAt, isActive]);

  const displaySteps = useMemo(() => {
    const fromDb = dbSteps.map(mapDbStep);
    const fromTrace = stepTrace.map(mapTraceStep);
    const base = fromDb.length > 0 ? fromDb : fromTrace;

    // Sous-étapes de branches parallèles : index encodé parent*100 + branche*10 + pos.
    // On les rattache à leur étape parente au lieu de les perdre (ou de les
    // afficher comme « étape 101 »).
    const tops: DisplayStep[] = [];
    const subsByParent = new Map<number, DisplayStep[]>();
    for (const s of base) {
      if (s.index >= 100) {
        const parent = Math.floor(s.index / 100);
        const branch = Math.floor((s.index % 100) / 10);
        const pos = s.index % 10;
        const list = subsByParent.get(parent) ?? [];
        list.push({ ...s, sub: { parent, branch, pos }, displayNo: `${parent + 1}.${branch + 1}.${pos + 1}` });
        subsByParent.set(parent, list);
      } else {
        tops.push(s);
      }
    }
    for (const list of subsByParent.values()) {
      list.sort((a, b) => (a.sub!.branch - b.sub!.branch) || (a.sub!.pos - b.sub!.pos));
    }

    const byIndex = new Map<number, DisplayStep>();
    for (const s of tops) byIndex.set(s.index, s);

    const planned = Math.max(totalSteps, plannedLabels.length) || tops.length;

    const merged: DisplayStep[] = [];
    const pushWithSubs = (step: DisplayStep) => {
      merged.push(step);
      const subs = subsByParent.get(step.index);
      if (subs) merged.push(...subs);
    };

    if (planned === 0) {
      for (const s of tops) pushWithSubs(s);
      return merged;
    }

    for (let i = 0; i < planned; i++) {
      const existing = byIndex.get(i);
      if (existing) {
        pushWithSubs(existing);
        continue;
      }
      const subs = subsByParent.get(i);
      const doneCount = liveCompleted || tops.filter((s) => s.status === "success").length;
      let stepStatus = "pending";
      if (subs && subs.length > 0) {
        // Étape parallèle sans ligne propre : son état se déduit de ses branches.
        stepStatus = subs.some((s) => s.status === "failed")
          ? "failed"
          : subs.every((s) => s.status === "success" || s.status === "skipped")
            ? i < doneCount
              ? "success"
              : "running"
            : "running";
        if (!isActive && stepStatus === "running") stepStatus = "success";
      } else if (i < doneCount) {
        stepStatus = "success";
      } else if (i === doneCount && isActive) {
        stepStatus = "running";
      }

      pushWithSubs({
        id: `planned-${i}`,
        index: i,
        type: subs && subs.length > 0 ? "parallel" : "pending",
        label:
          plannedLabels[i] ??
          (subs && subs.length > 0 ? `Branches parallèles (${subs.length} sous-étapes)` : `Étape ${i + 1}`),
        status: stepStatus,
        output: null,
        input: null,
        durationMs: null,
        model: null,
        actionSlug: null,
        error: null,
      });
    }
    // Sous-étapes orphelines au-delà du plan (sécurité).
    for (const [parent, subs] of subsByParent) {
      if (parent >= planned && !merged.some((m) => m.sub && m.sub.parent === parent)) {
        merged.push(...subs);
      }
    }
    return merged;
  }, [dbSteps, stepTrace, totalSteps, plannedLabels, liveCompleted, isActive]);

  // Suivi auto : on ne colle au bas de la liste que si l'utilisateur y est déjà —
  // sinon son scroll manuel serait aspiré à chaque mise à jour live.
  const autoFollow = useRef(true);
  const lastAutoExpanded = useRef<string | null>(null);
  useEffect(() => {
    const running = displaySteps.find((s) => s.status === "running");
    const lastDone = [...displaySteps].reverse().find((s) => s.status === "success");
    const target = running ?? lastDone;
    if (target && target.id !== lastAutoExpanded.current) {
      lastAutoExpanded.current = target.id;
      setExpanded(target.id);
      if (autoFollow.current) {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
      }
    }
  }, [displaySteps]);

  const topSteps = displaySteps.filter((s) => !s.sub);
  const progressTotal = totalSteps || topSteps.length || 1;
  const progressDone =
    liveCompleted || topSteps.filter((s) => s.status === "success").length;
  const progressPct = Math.min(100, Math.round((progressDone / progressTotal) * 100));

  const statusLabel =
    runStatus === "completed"
      ? "Terminé"
      : runStatus === "failed"
        ? "Échoué"
        : (runStatus as string) === "cancelled"
          ? "Annulé"
          : runStatus === "running"
            ? "Exécution en cours"
            : runStatus === "queued" || runStatus === "pending"
              ? "Démarrage…"
              : runStatus;

  const currentStep = displaySteps.find((s) => s.status === "running");

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
              {elapsed > 0 && (
                <span className="ml-2 inline-flex items-center gap-1">
                  <Timer className="inline h-3 w-3" />
                  {formatElapsed(elapsed)}
                </span>
              )}
            </p>
            {currentStep && isActive && (
              <p className="mt-1 text-xs text-sky-300">
                En cours : {currentStep.label}
              </p>
            )}
            {heartbeatAt && isActive && (
              <p className="mt-0.5 text-[10px] text-white/40">
                Dernier signal : {new Date(heartbeatAt).toLocaleTimeString("fr-FR")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isActive && (
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-sky-400" />
              </span>
            )}
            {isActive && runId && (
              <button
                type="button"
                onClick={cancelRun}
                disabled={cancelling}
                className="flex items-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-500/30 disabled:opacity-60"
              >
                {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                {cancelling ? "Arrêt en cours…" : "Arrêter"}
              </button>
            )}
            {runId && dbSteps.length > 0 && (
              <button
                type="button"
                onClick={copyReport}
                title="Copier le rapport (JSON des étapes)"
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                {copied ? "Copié" : "Rapport"}
              </button>
            )}
            {!isActive && onRetry && (runStatus === "failed" || runStatus === "completed") && (
              <button
                type="button"
                onClick={onRetry}
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Relancer
              </button>
            )}
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-500 ease-out"
            style={{ width: `${isActive && progressPct < 5 ? 5 : progressPct}%` }}
          />
        </div>
      </div>

      {errorMessage && runStatus === "failed" && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:px-5">
          <p className="font-medium">Erreur</p>
          <p className="mt-0.5 text-xs leading-relaxed">{errorMessage}</p>
        </div>
      )}

      <div
        ref={listRef}
        onScroll={() => {
          const el = listRef.current;
          if (el) autoFollow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="max-h-[min(60vh,520px)] overflow-y-auto overscroll-contain p-4 sm:p-5"
      >
        {loading && displaySteps.length === 0 ? (
          <div className="flex items-center gap-2 py-8 text-sm text-ink-soft">
            <Loader2 className="h-4 w-4 animate-spin" /> Connexion au run…
          </div>
        ) : displaySteps.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-faint">
            {isActive ? "L'agent démarre…" : "Aucune étape enregistrée."}
          </p>
        ) : (
          <ol className="relative space-y-0">
            {displaySteps.map((step, i) => {
              const isOpen = expanded === step.id;
              const isLast = i === displaySteps.length - 1;

              return (
                <li key={step.id} className={`relative flex gap-3 ${step.sub ? "pb-4 pl-8" : "pb-6"}`}>
                  {!isLast && (
                    <span
                      className={`absolute top-8 h-[calc(100%-8px)] w-px bg-line ${step.sub ? "left-[45px]" : "left-[15px]"}`}
                      aria-hidden
                    />
                  )}
                  <div
                    className={`relative z-10 flex shrink-0 items-center justify-center rounded-full border ${step.sub ? "h-7 w-7" : "h-8 w-8"} ${
                      step.status === "success"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : step.status === "failed"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : step.status === "running"
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-line bg-card text-ink-soft"
                    }`}
                  >
                    {step.status === "running" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      stepIcon(step.type)
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : step.id)}
                      className="flex w-full items-start justify-between gap-2 text-left"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`font-medium text-ink ${step.sub ? "text-[13px]" : "text-sm"}`}>
                            {step.displayNo ?? step.index + 1}. {step.label}
                          </span>
                          {step.sub && (
                            <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                              Branche {step.sub.branch + 1}
                            </span>
                          )}
                          {statusBadge(step.status)}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {step.type !== "pending" && (
                            <span className="rounded bg-line/70 px-1.5 py-0.5 text-[10px] uppercase text-ink-faint">
                              {step.type}
                            </span>
                          )}
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
                          {step.simulated && (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                              Aperçu — rien n&apos;a été envoyé
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

      {runStatus === "awaiting_approval" && approval && (
        <div className="border-t border-amber-300/50 bg-amber-50 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-amber-900">
              ⏸️ L&apos;agent attend votre validation pour continuer.
            </p>
            <button
              type="button"
              onClick={() => setModalDismissed(false)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-amber-950 hover:bg-amber-400"
            >
              Répondre
            </button>
          </div>
        </div>
      )}

      {showDebugAssistant && runId && runStatus === "failed" && (
        <div className="border-t border-line p-4 sm:p-5">
          <RunDebugAssistant runId={runId} status="failed" />
        </div>
      )}

      <HumanApprovalModal
        open={runStatus === "awaiting_approval" && approval != null && !modalDismissed}
        approval={approval}
        onApprove={handleApprove}
        onReject={handleReject}
        onClose={() => setModalDismissed(true)}
      />
    </div>
  );
}
