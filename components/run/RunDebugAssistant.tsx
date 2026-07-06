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
import { extractResourceId } from "@/lib/connectors/extract-resource-id";

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

interface NeededInput {
  key: string;
  label: string;
  kind: string;
  widget: string;
  resourceType?: string;
  connector?: string;
}

interface DebugResponse {
  summary: string;
  fixes: RunFix[];
  neededInputs?: NeededInput[];
  canRelaunch: boolean;
  relaunch: { listingId: string | null; versionId: string | null; inputs: Record<string, string> };
  status: string;
}

interface AutoFixUserAction {
  type: string;
  connector?: string;
  detail: string;
}

interface AutoFixQuestion {
  key: string;
  question: string;
  placeholder?: string;
}

interface AutoFixResponse {
  explanation: string;
  changes: string[];
  requiresUser: AutoFixUserAction[];
  questions?: AutoFixQuestion[];
  autoFixable: boolean;
  applied: boolean;
  blockedReason?: string | null;
  relaunchedRunId?: string | null;
  relaunch: { listingId: string | null; versionId: string | null; inputs: Record<string, string> };
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
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [relaunching, setRelaunching] = useState<"test" | "agent" | null>(null);
  const [autoFixing, setAutoFixing] = useState(false);
  const [autoFix, setAutoFix] = useState<AutoFixResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [newRunId, setNewRunId] = useState<string | null>(null);

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

  async function runAutoFix(withAnswers?: Record<string, string>) {
    setAutoFixing(true);
    try {
      const res = await fetch(`/api/run/agent/${runId}/auto-fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withAnswers ? { answers: withAnswers } : {}),
      });
      const json = (await res.json().catch(() => ({}))) as AutoFixResponse & { error?: string };
      if (!res.ok) {
        setAutoFix({
          explanation: json.error ?? "L'auto-correction a échoué.",
          changes: [],
          requiresUser: [],
          autoFixable: false,
          applied: false,
          relaunch: { listingId: null, versionId: null, inputs: {} },
        });
        return;
      }
      setAutoFix(json);
      // Run de test : l'IA a réparé ET relancé — on le signale clairement.
      if (json.relaunchedRunId) setNewRunId(json.relaunchedRunId);
      // Si une correction de plan a été appliquée, relancer sur la version corrigée.
      if (json.applied && json.relaunch.versionId && data) {
        setData({ ...data, relaunch: { ...data.relaunch, versionId: json.relaunch.versionId } });
      }
    } finally {
      setAutoFixing(false);
    }
  }

  async function relaunch(mode: "test" | "agent") {
    if (!data?.relaunch.listingId || !data.relaunch.versionId) return;
    setRelaunching(mode);
    try {
      // Fusionne les valeurs saisies dans l'assistant avec les inputs d'origine.
      const mergedInputs = { ...(data.relaunch.inputs ?? {}), ...fieldValues };
      const res = await fetch("/api/run/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: data.relaunch.listingId,
          versionId: data.relaunch.versionId,
          inputs: mergedInputs,
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

            <div className="rounded-xl border border-accent/30 bg-accent/5 p-3">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">Réparation automatique par l&apos;IA</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    L&apos;IA lit les logs, corrige le plan quand c&apos;est possible et prépare le relancement.
                  </p>
                  <button
                    type="button"
                    onClick={() => void runAutoFix()}
                    disabled={autoFixing}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    {autoFixing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wrench className="h-4 w-4" />
                    )}
                    {autoFixing ? "Diagnostic & correction…" : "Réparer avec l'IA"}
                  </button>

                  {autoFix && (
                    <div className="mt-3 space-y-2">
                      <p className="whitespace-pre-line text-xs text-ink">{autoFix.explanation}</p>

                      {newRunId && (
                        <button
                          type="button"
                          onClick={() => router.push(`/dashboard/runs/${newRunId}`)}
                          className="flex w-full items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-left hover:bg-emerald-100"
                        >
                          <span className="relative flex h-2.5 w-2.5 shrink-0">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                          </span>
                          <span className="text-xs font-semibold text-emerald-800">
                            Plan corrigé — un nouveau run est en cours. Suivre en direct →
                          </span>
                        </button>
                      )}

                      {autoFix.applied && (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-800">
                            <Check className="h-3.5 w-3.5" /> Plan corrigé et enregistré.
                          </p>
                          {autoFix.changes.length > 0 && (
                            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-emerald-900">
                              {autoFix.changes.map((c, i) => (
                                <li key={i}>{c}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}

                      {!autoFix.applied && autoFix.blockedReason && (
                        <p className="text-xs text-amber-700">{autoFix.blockedReason}</p>
                      )}

                      {autoFix.requiresUser.length > 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                          <p className="text-xs font-medium text-amber-800">
                            À faire de votre côté (l&apos;IA ne peut pas le faire seule) :
                          </p>
                          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-amber-900">
                            {autoFix.requiresUser.map((r, i) => (
                              <li key={i}>
                                {r.connector ? `${r.connector} — ` : ""}
                                {r.detail}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {(autoFix.questions?.length ?? 0) > 0 && !newRunId && (
                        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                          <p className="text-xs font-semibold text-sky-900">
                            L&apos;IA a besoin de précisions pour terminer la réparation :
                          </p>
                          <div className="mt-2 space-y-2">
                            {autoFix.questions!.map((q) => (
                              <label key={q.key} className="block">
                                <span className="mb-1 block text-xs text-sky-900">{q.question}</span>
                                <input
                                  type="text"
                                  value={answers[q.key] ?? ""}
                                  placeholder={q.placeholder ?? "Votre réponse"}
                                  onChange={(e) =>
                                    setAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))
                                  }
                                  className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
                                />
                              </label>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => void runAutoFix(answers)}
                            disabled={autoFixing || autoFix.questions!.every((q) => !(answers[q.key] ?? "").trim())}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                          >
                            {autoFixing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            Envoyer les réponses & réparer
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

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

            {data.neededInputs && data.neededInputs.length > 0 && (
              <div className="rounded-xl border border-line bg-card2/40 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <Wrench className="h-4 w-4 text-accent" /> Renseigner les valeurs requises
                </p>
                <p className="mb-3 text-xs text-ink-faint">
                  Collez l&apos;ID ou l&apos;URL (Drive, Sheet, Doc…) — il sera utilisé au relancement.
                </p>
                <div className="space-y-2">
                  {data.neededInputs.map((inp) => {
                    const isResource = inp.kind === "resource" || inp.widget === "resource";
                    return (
                      <label key={inp.key} className="block">
                        <span className="mb-1 block text-xs font-medium text-ink-soft">
                          {inp.label}
                          {inp.connector ? ` · ${inp.connector}` : ""}
                        </span>
                        <input
                          type="text"
                          value={fieldValues[inp.key] ?? ""}
                          placeholder={isResource ? "ID ou URL complète" : `Valeur pour « ${inp.label} »`}
                          onChange={(e) =>
                            setFieldValues((prev) => ({ ...prev, [inp.key]: e.target.value }))
                          }
                          onBlur={(e) => {
                            if (!isResource) return;
                            const extracted = extractResourceId(e.target.value);
                            if (extracted && extracted !== e.target.value) {
                              setFieldValues((prev) => ({ ...prev, [inp.key]: extracted }));
                            }
                          }}
                          className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

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
