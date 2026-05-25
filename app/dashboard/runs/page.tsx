"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, RotateCcw, ExternalLink } from "lucide-react";

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
}

export default function RunsHistoryPage() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [relancing, setRelancing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/runs")
      .then((r) => r.json())
      .then((d) => setRuns(d.runs ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function handleRelancer(run: RunRow) {
    if (!run.listing_id || !run.version_id || !run.model) return;
    setRelancing(run.id);
    setExpanded(run.id);

    const res = await fetch("/api/run/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listingId: run.listing_id,
        versionId: run.version_id,
        model: run.model,
        variables: {},
      }),
    });

    if (!res.ok || !res.body) {
      setRelancing(null);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let output = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "chunk") output += data.content;
          if (data.type === "done") {
            setRuns((prev) =>
              prev.map((r) =>
                r.id === run.id
                  ? { ...r, output, status: "completed", created_at: new Date().toISOString() }
                  : r
              )
            );
          }
        } catch {
          /* ignore */
        }
      }
    }

    setRelancing(null);
    fetch("/api/runs")
      .then((r) => r.json())
      .then((d) => setRuns(d.runs ?? []));
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
      <h1 className="font-display text-2xl font-bold text-ink">
        Historique des runs
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Vos exécutions de prompts sur la plateforme.
      </p>

      {runs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-line bg-card p-12 text-center">
          <p className="text-ink-soft">Aucun run pour le moment.</p>
          <Link
            href="/explore"
            className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
          >
            Explorer les prompts →
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {runs.map((run) => (
            <div
              key={run.id}
              className="rounded-xl border border-line bg-card p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">
                    {run.listing?.title ?? "Prompt"}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {run.model} ·{" "}
                    {new Date(run.created_at).toLocaleString("fr-FR")} ·{" "}
                    <span
                      className={
                        run.status === "completed"
                          ? "text-green-600"
                          : run.status === "failed"
                            ? "text-red-600"
                            : "text-amber-600"
                      }
                    >
                      {run.status}
                    </span>
                    {run.cost_estimate != null && run.cost_estimate > 0 && (
                      <> · ~{run.cost_estimate.toFixed(4)} $</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {run.listing && (
                    <Link
                      href={`/listing/${run.listing.slug}`}
                      className="flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      Fiche <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                  {run.status !== "running" && run.listing_id && (
                    <button
                      onClick={() => handleRelancer(run)}
                      disabled={relancing === run.id}
                      className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-card2 disabled:opacity-50"
                    >
                      {relancing === run.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3" />
                      )}
                      Relancer
                    </button>
                  )}
                  {run.output && (
                    <button
                      onClick={() =>
                        setExpanded(expanded === run.id ? null : run.id)
                      }
                      className="text-xs text-accent hover:underline"
                    >
                      {expanded === run.id ? "Masquer" : "Voir"}
                    </button>
                  )}
                </div>
              </div>
              {expanded === run.id && run.output && (
                <pre className="mt-3 max-h-60 overflow-auto rounded-lg bg-card2 p-3 text-xs text-ink-soft whitespace-pre-wrap">
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
