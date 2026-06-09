"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Loader2,
  Play,
  Plug,
  RefreshCw,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";

type RunFixKind =
  | "connect"
  | "reconnect"
  | "resource"
  | "input"
  | "write_content"
  | "retry"
  | "limit"
  | "approval"
  | "unknown";

interface RunFix {
  id: string;
  kind: RunFixKind;
  title: string;
  detail: string;
  connector?: string;
  connectUrl?: string;
  stepIndex: number;
  severity: "blocker" | "warning";
  retryable: boolean;
}

interface DebugResponse {
  summary: string;
  fixes: RunFix[];
  canRelaunch: boolean;
  relaunch: { listingId: string | null; versionId: string | null; inputs: Record<string, string> };
  status: string;
}

interface Props {
  runId: string;
  /** Statut du run — l'assistant ne s'affiche que sur un run échoué. */
  status?: string | null;
}

type DiagState = { status: "idle" | "checking" | "ok" | "ko"; message?: string };

export function RunDebugAssistant({ runId, status }: Props) {
  const router = useRouter();
  const [data, setData] = useState<DebugResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [diag, setDiag] = useState<Record<string, DiagState>>({});
  const [relaunching, setRelaunching] = useState<"test" | "agent" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/run/agent/${runId}/debug`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    if (status === "failed") load();
  }, [status, load]);

  async function testAccess(connector: string) {
    setDiag((d) => ({ ...d, [connector]: { status: "checking" } }));
    try {
      const res = await fetch(`/api/connectors/${encodeURIComponent(connector)}/diagnose`, {
        method: "POST",
      });
      const r = await res.json();
      setDiag((d) => ({
        ...d,
        [connector]: {
          status: r.ok ? "ok" : "ko",
          message: r.message ?? (r.ok ? "Accès confirmé" : "Accès indisponible"),
        },
      }));
    } catch {
      setDiag((d) => ({ ...d, [connector]: { status: "ko", message: "Test impossible" } }));
    }
  }

  async function relaunch(mode: "test" | "agent") {
    if (!data?.relaunch.listingId || !data.relaunch.versionId) return;
    setRelaunching(mode);
    try {
      const res = await fetch("/api/run/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: data.relaunch.listingId,
          versionId: data.relaunch.versionId,
          inputs: data.relaunch.inputs ?? {},
          dryRun: mode === "test",
          async: mode === "agent",
        }),
      });
      const json = await res.json().catch(() => ({}));
      const newRunId = json.runId ?? json.run_id ?? json.id;
      if (newRunId && newRunId !== runId) {
        router.push(`/dashboard/runs/${newRunId}`);
      } else {
        await load();
      }
    } finally {
      setRelaunching(null);
    }
  }

  if (status !== "failed") return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-card2 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-ink">Assistant de debug</h2>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1 text-xs font-medium hover:bg-card2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Analyser
        </button>
      </div>

      <div className="space-y-3 p-4">
        {loading && !data ? (
          <div className="flex items-center gap-2 py-4 text-sm text-ink-soft">
            <Loader2 className="h-4 w-4 animate-spin" /> Analyse des erreurs…
          </div>
        ) : !data ? (
          <p className="py-3 text-sm text-ink-soft">
            Cliquez sur « Analyser » pour diagnostiquer ce qui a bloqué.
          </p>
        ) : (
          <>
            <p className="text-sm text-ink">{data.summary}</p>

            {data.fixes.map((fix) => (
              <div
                key={fix.id}
                className={`rounded-xl border p-3 ${
                  fix.severity === "blocker"
                    ? "border-red-200 bg-red-50"
                    : "border-amber-200 bg-amber-50"
                }`}
              >
                <div className="flex items-start gap-2">
                  {fix.severity === "blocker" ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  ) : (
                    <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">
                      Étape {fix.stepIndex + 1} — {fix.title}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-soft">{fix.detail}</p>

                    {(fix.kind === "connect" || fix.kind === "reconnect") && fix.connector && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {fix.connectUrl && (
                          <a
                            href={fix.connectUrl}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
                          >
                            <Plug className="h-3.5 w-3.5" />
                            {fix.kind === "reconnect" ? "Reconnecter" : "Se connecter"} — {fix.connector}
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => testAccess(fix.connector!)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-medium hover:bg-card2"
                        >
                          {diag[fix.connector]?.status === "checking" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          Tester l&apos;accès
                        </button>
                        {diag[fix.connector] && diag[fix.connector].status !== "checking" && (
                          <span
                            className={`inline-flex items-center gap-1 text-xs ${
                              diag[fix.connector].status === "ok" ? "text-emerald-700" : "text-red-700"
                            }`}
                          >
                            {diag[fix.connector].status === "ok" ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <X className="h-3.5 w-3.5" />
                            )}
                            {diag[fix.connector].message}
                          </span>
                        )}
                      </div>
                    )}

                    {(fix.kind === "resource" ||
                      fix.kind === "input" ||
                      fix.kind === "write_content" ||
                      fix.kind === "limit") &&
                      data.relaunch.listingId && (
                        <a
                          href={`/dashboard/listing/${data.relaunch.listingId}/edit`}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-medium hover:bg-card2"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Corriger dans l&apos;éditeur
                        </a>
                      )}
                  </div>
                </div>
              </div>
            ))}

            {data.canRelaunch ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <button
                  type="button"
                  onClick={() => relaunch("test")}
                  disabled={relaunching !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-sm font-medium hover:bg-card2 disabled:opacity-50"
                >
                  {relaunching === "test" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Relancer le test (aperçu)
                </button>
                <button
                  type="button"
                  onClick={() => relaunch("agent")}
                  disabled={relaunching !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {relaunching === "agent" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Relancer l&apos;agent
                </button>
              </div>
            ) : (
              <p className="border-t border-line pt-3 text-xs text-ink-faint">
                Relancement direct indisponible pour ce run — ouvrez l&apos;agent pour le relancer.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
