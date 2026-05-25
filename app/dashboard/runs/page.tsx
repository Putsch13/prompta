"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, RotateCcw, Settings } from "lucide-react";

interface RunRow {
  id: string;
  status: string;
  model: string | null;
  output: string | null;
  error_message: string | null;
  cost_estimate: number | null;
  created_at: string;
  listing: { title: string; slug: string } | null;
  version_id: string | null;
  listing_id: string | null;
  kind?: "prompt" | "agent";
}

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  running: "En cours",
  completed: "Terminé",
  failed: "Échoué",
  suspended: "Suspendu",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-amber-600",
  running: "text-blue-600",
  completed: "text-green-600",
  failed: "text-red-600",
  suspended: "text-orange-600",
};

export default function RunsHistoryPage() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [relancing, setRelancing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  function loadRuns() {
    fetch("/api/runs")
      .then((r) => r.json())
      .then((d) => setRuns(d.runs ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadRuns();
  }, []);

  async function handleRetry(run: RunRow) {
    if (!run.listing_id || !run.version_id) return;
    setRelancing(run.id);
    setExpanded(run.id);

    if (run.kind === "agent") {
      const res = await fetch("/api/run/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: run.listing_id,
          versionId: run.version_id,
          inputs: {},
          async: false,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRuns((prev) =>
          prev.map((r) =>
            r.id === run.id
              ? {
                  ...r,
                  status: data.status,
                  output: data.output?.result ?? JSON.stringify(data.output),
                  error_message: data.error ?? null,
                }
              : r
          )
        );
      }
      setRelancing(null);
      loadRuns();
      return;
    }

    const res = await fetch("/api/run/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listingId: run.listing_id,
        versionId: run.version_id,
        model: run.model ?? "gpt-4o",
        variables: {},
      }),
    });

    if (!res.ok || !res.body) {
      setRelancing(null);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let streamedOutput = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "chunk") streamedOutput += data.content;
        } catch {
          /* ignore */
        }
      }
    }

    void streamedOutput;

    setRelancing(null);
    loadRuns();
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">Historique des runs</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Prompts et agents — statuts pending, running, completed, failed, suspended.
      </p>

      {runs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-line bg-card p-12 text-center">
          <p className="text-ink-soft">Aucun run pour le moment.</p>
          <Link href="/explore" className="mt-4 inline-block text-sm font-medium text-accent hover:underline">
            Explorer →
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {runs.map((run) => (
            <div key={run.id} className="rounded-xl border border-line bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">
                    {run.listing?.title ?? "Run"}
                    {run.kind === "agent" && (
                      <span className="ml-2 rounded bg-accent-light px-1.5 py-0.5 text-[10px] text-accent">
                        agent
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {run.model} · {new Date(run.created_at).toLocaleString("fr-FR")} ·{" "}
                    <span className={STATUS_COLORS[run.status] ?? "text-ink-soft"}>
                      {STATUS_LABELS[run.status] ?? run.status}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {(run.status === "failed" || run.status === "suspended") &&
                    run.error_message?.includes("Clé") && (
                      <Link
                        href="/dashboard/connexions"
                        className="flex items-center gap-1 text-xs text-accent hover:underline"
                      >
                        <Settings className="h-3 w-3" /> Reconnecter une clé
                      </Link>
                    )}
                  {run.status !== "running" && run.status !== "pending" && run.listing_id && (
                    <button
                      onClick={() => handleRetry(run)}
                      disabled={relancing === run.id}
                      className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-card2 disabled:opacity-50"
                    >
                      {relancing === run.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3" />
                      )}
                      Réessayer
                    </button>
                  )}
                  {run.output && (
                    <button
                      onClick={() => setExpanded(expanded === run.id ? null : run.id)}
                      className="text-xs text-accent hover:underline"
                    >
                      {expanded === run.id ? "Masquer" : "Voir"}
                    </button>
                  )}
                </div>
              </div>
              {expanded === run.id && run.output && (
                <pre className="mt-3 max-h-60 overflow-auto rounded-lg bg-card2 p-3 text-xs whitespace-pre-wrap">
                  {run.output}
                </pre>
              )}
              {run.error_message && (
                <p className="mt-2 text-xs text-destructive">{run.error_message}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
