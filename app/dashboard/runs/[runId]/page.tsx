"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ClipboardCopy, Check, Loader2, RotateCcw } from "lucide-react";
import { AgentRunConsole } from "@/components/run/AgentRunConsole";
import type { RunStepLog } from "@/components/run/RunStepTimeline";

interface RunDetail {
  id: string;
  status: string;
  output: unknown;
  error_message: string | null;
  steps_completed: number | null;
  created_at: string;
  started_at: string | null;
  heartbeat_at: string | null;
}

const ACTIVE = new Set(["pending", "queued", "running", "awaiting_approval"]);

export default function RunDetailPage() {
  const params = useParams();
  const runId = String(params.runId);
  const [run, setRun] = useState<RunDetail | null>(null);
  const [steps, setSteps] = useState<(RunStepLog & { errorDetail?: unknown })[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const [runRes, stepsRes] = await Promise.all([
      fetch(`/api/run/agent/${runId}`),
      fetch(`/api/run/agent/${runId}/steps`),
    ]);
    if (runRes.ok) setRun(await runRes.json());
    if (stepsRes.ok) {
      const d = await stepsRes.json();
      setSteps(d.steps ?? []);
    }
    setLoading(false);
  }, [runId]);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (run && ACTIVE.has(run.status)) load();
    }, 3000);
    return () => clearInterval(t);
  }, [load, run]);

  const failedSteps = steps.filter((s) => s.status === "failed");

  async function copyReport() {
    const report = {
      runId,
      status: run?.status,
      createdAt: run?.created_at,
      error: run?.error_message,
      steps: steps.map((s) => ({
        index: s.stepIndex,
        label: s.label,
        type: s.stepType,
        status: s.status,
        provider: s.provider,
        model: s.model,
        toolSlug: s.toolSlug,
        actionSlug: s.actionSlug,
        durationMs: s.durationMs,
        errorCode: s.errorCode,
        errorMessage: s.errorMessage,
        errorDetail: s.errorDetail,
      })),
    };
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-card p-12 text-center">
        <p className="text-ink-soft">Run introuvable ou accès refusé.</p>
        <Link href="/dashboard/runs" className="mt-4 inline-block text-sm font-medium text-accent hover:underline">
          ← Retour aux runs
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/runs"
          className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Runs &amp; logs
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copyReport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-card2"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
            {copied ? "Copié" : "Copier le rapport"}
          </button>
          <Link
            href={`/dashboard/runs?id=${runId}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-card2"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Relancer
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <h1 className="font-display text-2xl font-bold text-ink">Détail du run</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {new Date(run.created_at).toLocaleString("fr-FR")}
          {failedSteps.length > 0 && (
            <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
              {failedSteps.length} étape(s) en échec
            </span>
          )}
        </p>
      </div>

      <div className="mt-6">
        <AgentRunConsole
          runId={runId}
          status={run.status}
          pollWhileRunning={ACTIVE.has(run.status)}
          title="Exécution"
          errorMessage={run.error_message}
        />
      </div>

      {failedSteps.length > 0 && (
        <div className="mt-6 space-y-3">
          <h2 className="text-sm font-semibold text-ink">Détails techniques des erreurs</h2>
          {failedSteps.map((s) => (
            <div key={s.id} className="rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink">
                  {s.stepIndex + 1}. {s.label ?? s.stepType}
                </span>
                {s.errorCode && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700">
                    {s.errorCode}
                  </span>
                )}
                {s.actionSlug && (
                  <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                    {s.actionSlug}
                  </span>
                )}
              </div>
              {s.errorMessage && (
                <p className="mt-1.5 text-xs text-red-800">{s.errorMessage}</p>
              )}
              {s.errorDetail != null && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] font-medium text-red-700">
                    Détails techniques (sans secret)
                  </summary>
                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-white p-2 text-[10px] whitespace-pre-wrap">
                    {JSON.stringify(s.errorDetail, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
