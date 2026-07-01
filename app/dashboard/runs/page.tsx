"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, RotateCcw, Settings, X, MessageSquareReply } from "lucide-react";
import { AgentRunConsole } from "@/components/run/AgentRunConsole";
import { StatusPill, statusTone, EmptyState } from "@/components/ui";

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
  inputs?: Record<string, string> | null;
  kind?: "prompt" | "agent";
}

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  queued: "En file",
  running: "En cours",
  awaiting_approval: "Validation requise",
  completed: "Terminé",
  failed: "Échoué",
  suspended: "Suspendu",
  cancelled: "Annulé",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-amber-600",
  queued: "text-amber-600",
  running: "text-blue-600",
  awaiting_approval: "text-purple-600",
  completed: "text-green-600",
  failed: "text-red-600",
  suspended: "text-orange-600",
  cancelled: "text-ink-faint",
};

type RunFilter = "all" | "active" | "approval" | "done";

export default function RunsHistoryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      }
    >
      <RunsHistoryContent />
    </Suspense>
  );
}

function RunsHistoryContent() {
  const searchParams = useSearchParams();
  const focusRunId = searchParams.get("id");
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [relancing, setRelancing] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(focusRunId);
  const [filter, setFilter] = useState<RunFilter>("all");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(
    searchParams.get("agent")
  );

  function loadRuns() {
    fetch("/api/runs")
      .then((r) => r.json())
      .then((d) => setRuns(d.runs ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadRuns();
    const t = setInterval(loadRuns, 10_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (focusRunId) setExpanded(focusRunId);
  }, [focusRunId]);

  async function cancelRun(run: RunRow) {
    setCancelling(run.id);
    try {
      await fetch(`/api/run/agent/${run.id}/cancel`, { method: "POST" });
    } catch {
      /* best-effort */
    } finally {
      setCancelling(null);
      loadRuns();
    }
  }

  async function handleRetry(run: RunRow) {
    if (!run.listing_id || !run.version_id) return;
    setRelancing(run.id);
    setExpanded(run.id);

    if (run.kind === "agent") {
      // async:true = même chemin que le lancement normal (worker). Le mode
      // sync bloquait la requête HTTP pendant tout le run (timeout proxy
      // possible) et perdait la reprise worker en cas de coupure.
      const res = await fetch("/api/run/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: run.listing_id,
          versionId: run.version_id,
          // P3-1 : on réutilise les entrées du run d'origine (sinon un agent
          // qui exige des inputs échouerait silencieusement avec inputs:{}).
          inputs: run.inputs ?? {},
          async: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.runId) {
        // Le nouveau run apparaît en tête via loadRuns ; on ouvre sa console.
        setExpanded(data.runId);
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
        model: run.model ?? "gpt-5.4",
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

  // Regroupe les runs par agent (listing) pour une vue type Render : on
  // sélectionne un agent à gauche, on voit ses runs + logs + erreurs à droite.
  const agents = (() => {
    const map = new Map<
      string,
      { id: string; title: string; slug: string | null; count: number; lastStatus: string }
    >();
    for (const run of runs) {
      const id = run.listing_id ?? "__sans_agent__";
      const title = run.listing?.title ?? "Run isolé";
      const existing = map.get(id);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(id, {
          id,
          title,
          slug: run.listing?.slug ?? null,
          count: 1,
          lastStatus: run.status,
        });
      }
    }
    return Array.from(map.values());
  })();

  const agentRuns = selectedAgent
    ? runs.filter((r) => (r.listing_id ?? "__sans_agent__") === selectedAgent)
    : runs;

  const filtered = agentRuns.filter((run) => {
    if (filter === "all") return true;
    if (filter === "active") {
      return run.status === "pending" || run.status === "queued" || run.status === "running";
    }
    if (filter === "approval") return run.status === "awaiting_approval";
    return ["completed", "failed", "suspended"].includes(run.status);
  });

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">Runs &amp; logs</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Sélectionnez un agent pour suivre ses exécutions, validations et erreurs.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Colonne agents */}
        <aside className="space-y-1">
          <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            Mes agents
          </p>
          <button
            type="button"
            onClick={() => setSelectedAgent(null)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              selectedAgent === null ? "bg-accent/10 text-accent" : "text-ink-soft hover:bg-card2"
            }`}
          >
            <span className="font-medium">Tous les runs</span>
            <span className="rounded-full bg-line px-1.5 py-0.5 text-[10px]">{runs.length}</span>
          </button>
          {agents.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelectedAgent(a.id)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                selectedAgent === a.id ? "bg-accent/10 text-accent" : "text-ink-soft hover:bg-card2"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${(STATUS_COLORS[a.lastStatus] ?? "text-ink-faint").replace("text-", "bg-")}`} />
                <span className="truncate font-medium">{a.title}</span>
              </span>
              <span className="rounded-full bg-line px-1.5 py-0.5 text-[10px]">{a.count}</span>
            </button>
          ))}
          {agents.length === 0 && (
            <p className="px-2 text-xs text-ink-faint">Aucun agent exécuté.</p>
          )}
        </aside>

        {/* Colonne runs de l'agent sélectionné */}
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "all" as const, label: "Tout" },
                { id: "active" as const, label: "En cours" },
                { id: "approval" as const, label: "Validation" },
                { id: "done" as const, label: "Terminés" },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  filter === f.id ? "bg-accent text-white" : "bg-card2 text-ink-soft"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Aucun run dans cette vue"
            description="Lancez un agent pour voir ses exécutions, logs et erreurs apparaître ici."
            action={
              <Link href="/dashboard/contenus" className="text-sm font-medium text-accent hover:underline">
                Voir mes agents →
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {filtered.map((run) => (
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
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
                    <span>{run.model} · {new Date(run.created_at).toLocaleString("fr-FR")}</span>
                    <StatusPill tone={statusTone(run.status)}>
                      {STATUS_LABELS[run.status] ?? run.status}
                    </StatusPill>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {run.status === "awaiting_approval" && (
                    <button
                      onClick={() => setExpanded(run.id)}
                      className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-400"
                    >
                      <MessageSquareReply className="h-3 w-3" /> Répondre
                    </button>
                  )}
                  {(run.status === "running" ||
                    run.status === "pending" ||
                    run.status === "queued" ||
                    run.status === "awaiting_approval") && (
                    <button
                      onClick={() => cancelRun(run)}
                      disabled={cancelling === run.id}
                      className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-card2 disabled:opacity-50"
                    >
                      {cancelling === run.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                      Arrêter
                    </button>
                  )}
                  {(run.status === "failed" || run.status === "suspended") &&
                    run.error_message?.includes("Clé") && (
                      <Link
                        href="/dashboard/connexions"
                        className="flex items-center gap-1 text-xs text-accent hover:underline"
                      >
                        <Settings className="h-3 w-3" /> Reconnecter une clé
                      </Link>
                    )}
                  {run.status !== "running" &&
                    run.status !== "pending" &&
                    run.status !== "queued" &&
                    run.listing_id && (
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
                  {(run.output || run.kind === "agent") && (
                    <button
                      onClick={() => setExpanded(expanded === run.id ? null : run.id)}
                      className="text-xs text-accent hover:underline"
                    >
                      {expanded === run.id ? "Masquer" : "Voir"}
                    </button>
                  )}
                  {run.kind === "agent" && (
                    <Link
                      href={`/dashboard/runs/${run.id}`}
                      className="text-xs text-ink-soft hover:text-ink hover:underline"
                    >
                      Détail &amp; logs →
                    </Link>
                  )}
                </div>
              </div>
              {expanded === run.id && run.kind === "agent" && (
                <div className="mt-3">
                  <AgentRunConsole
                    runId={run.id}
                    status={run.status}
                    pollWhileRunning={
                      run.status === "running" ||
                      run.status === "pending" ||
                      run.status === "queued" ||
                      run.status === "awaiting_approval"
                    }
                    title={run.listing?.title ?? "Agent"}
                  />
                </div>
              )}
              {expanded === run.id && run.output && run.kind !== "agent" && (
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
      </div>
    </div>
  );
}
