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
  authorizing: "Autorisation…",
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
  authorizing: "text-warning",
  pending: "text-warning",
  queued: "text-warning",
  running: "text-accent",
  awaiting_approval: "text-violet-300",
  completed: "text-success",
  failed: "text-destructive",
  suspended: "text-warning",
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
  // Pages d'historique plus anciennes (bouton « Charger plus ») — jamais
  // écrasées par le rafraîchissement auto de la première page.
  const [olderRuns, setOlderRuns] = useState<RunRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savedAgents, setSavedAgents] = useState<
    { id: string; title: string; versionId: string; createdAt: string }[]
  >([]);
  // Plannings (scheduled_runs) : un par agent au plus, indexé par listingId.
  const [schedules, setSchedules] = useState<
    Record<string, { id: string; label: string; active: boolean; nextRunAt: string | null }>
  >({});
  const [schedulingFor, setSchedulingFor] = useState<string | null>(null);
  const [scheduleKind, setScheduleKind] = useState<"daily" | "weekly">("weekly");
  const [scheduleDay, setScheduleDay] = useState(1);
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [relancing, setRelancing] = useState<string | null>(null);
  const [launchingAgent, setLaunchingAgent] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(focusRunId);
  const [filter, setFilter] = useState<RunFilter>("all");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(
    searchParams.get("agent")
  );

  function loadRuns(opts?: { initial?: boolean }) {
    fetch("/api/runs")
      .then((r) => r.json())
      .then((d) => {
        setRuns(d.runs ?? []);
        setSavedAgents(d.savedAgents ?? []);
        // Le rafraîchissement périodique ne pilote pas le bouton « Charger
        // plus » : seul le chargement initial (et loadMore) fixent hasMore,
        // sinon un historique entièrement déroulé refait apparaître le bouton.
        if (opts?.initial) setHasMore(Boolean(d.hasMore));
      })
      .finally(() => setLoading(false));
  }

  /** Charge la page d'historique PLUS ANCIENNE que le plus vieux run affiché. */
  async function loadMore() {
    const all = [...runs, ...olderRuns];
    const oldest = all[all.length - 1]?.created_at;
    if (!oldest || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/runs?before=${encodeURIComponent(oldest)}`);
      const d = await res.json();
      const seen = new Set(all.map((r) => r.id));
      const fresh = ((d.runs ?? []) as RunRow[]).filter((r) => !seen.has(r.id));
      setOlderRuns((prev) => [...prev, ...fresh]);
      setHasMore(Boolean(d.hasMore) && fresh.length > 0);
    } catch {
      /* best-effort — le bouton reste cliquable */
    } finally {
      setLoadingMore(false);
    }
  }

  /** Relance un agent gardé depuis zéro (nouveau run, même chemin worker). */
  function loadSchedules() {
    fetch("/api/schedules")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.schedules) return;
        const byListing: Record<
          string,
          { id: string; label: string; active: boolean; nextRunAt: string | null }
        > = {};
        for (const s of d.schedules) {
          byListing[s.listingId] = {
            id: s.id,
            label: s.label,
            active: s.active,
            nextRunAt: s.nextRunAt ?? null,
          };
        }
        setSchedules(byListing);
      })
      .catch(() => undefined);
  }

  async function saveSchedule(listingId: string) {
    setScheduleBusy(true);
    setScheduleError(null);
    const token =
      scheduleKind === "daily" ? `daily@${scheduleTime}` : `weekly:${scheduleDay}@${scheduleTime}`;
    try {
      // Les entrées de contexte de page sont écartées côté serveur : un
      // planning ne doit pas rejouer l'écran d'il y a trois semaines.
      const lastRun = [...runs, ...olderRuns].find((r) => r.listing_id === listingId && r.inputs);
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, token, inputs: lastRun?.inputs ?? {} }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setScheduleError(body.message ?? "Planning impossible.");
        return;
      }
      setSchedules((s) => ({
        ...s,
        [listingId]: { id: body.id, label: body.label, active: true, nextRunAt: body.nextRunAt },
      }));
      setSchedulingFor(null);
    } catch {
      setScheduleError("Réseau indisponible.");
    } finally {
      setScheduleBusy(false);
    }
  }

  async function removeSchedule(listingId: string, scheduleId: string) {
    setScheduleBusy(true);
    try {
      await fetch(`/api/schedules/${scheduleId}`, { method: "DELETE" });
      setSchedules((s) => {
        const next = { ...s };
        delete next[listingId];
        return next;
      });
    } catch {
      /* best-effort : le rechargement corrigera l'affichage */
    } finally {
      setScheduleBusy(false);
    }
  }

  async function launchSavedAgent(agent: { id: string; versionId: string }) {
    setLaunchingAgent(agent.id);
    setLaunchError(null);
    try {
      // Réutilise les inputs du dernier run de cet agent : sans eux, les
      // placeholders ({{page_active}}, inputs requis) partent vides et la
      // mission tourne dégradée ou est refusée (configuration_incomplete).
      const lastRun = [...runs, ...olderRuns].find((r) => r.listing_id === agent.id && r.inputs);
      const res = await fetch("/api/run/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: agent.id,
          versionId: agent.versionId,
          inputs: lastRun?.inputs ?? {},
          async: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.runId) {
        setSelectedAgent(agent.id);
        setExpanded(data.runId);
      } else if (!res.ok) {
        setLaunchError(
          data.message ?? data.error ?? `Relance impossible (${res.status}) — réessaie.`,
        );
      }
      loadRuns();
    } catch {
      setLaunchError("Erreur réseau — vérifie ta connexion et réessaie.");
    } finally {
      setLaunchingAgent(null);
    }
  }

  useEffect(() => {
    loadRuns({ initial: true });
    loadSchedules();
    const t = setInterval(() => loadRuns(), 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setLaunchError(null);
    // try/finally : un fetch rejeté ou un res.json() qui throw ne doit pas
    // laisser le bouton « Réessayer » en spinner pour toujours.
    try {
      await handleRetryInner(run);
    } catch {
      setLaunchError("Erreur réseau — vérifie ta connexion et réessaie.");
    } finally {
      setRelancing(null);
      loadRuns();
    }
  }

  async function handleRetryInner(run: RunRow) {
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
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.runId) {
        // Le nouveau run apparaît en tête via loadRuns ; on ouvre sa console.
        setExpanded(data.runId);
      } else if (!res.ok) {
        setLaunchError(
          data.message ?? data.error ?? `Relance impossible (${res.status}) — réessaie.`,
        );
      }
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
      const data = await res.json().catch(() => ({}));
      setLaunchError(
        data.message ?? data.error ?? `Relance impossible (${res.status}) — réessaie.`,
      );
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
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  // Historique affiché = première page (rafraîchie) + pages anciennes
  // chargées à la demande (dédupliquées, triées par date décroissante).
  const firstPageIds = new Set(runs.map((r) => r.id));
  const allRuns = [...runs, ...olderRuns.filter((r) => !firstPageIds.has(r.id))].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  // Regroupe les runs par agent (listing) pour une vue type Render : on
  // sélectionne un agent à gauche, on voit ses runs + logs + erreurs à droite.
  const agents = (() => {
    const map = new Map<
      string,
      { id: string; title: string; slug: string | null; count: number; lastStatus: string }
    >();
    for (const run of allRuns) {
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
    ? allRuns.filter((r) => (r.listing_id ?? "__sans_agent__") === selectedAgent)
    : allRuns;

  const filtered = agentRuns.filter((run) => {
    if (filter === "all") return true;
    if (filter === "active") {
      return (
        run.status === "authorizing" ||
        run.status === "pending" ||
        run.status === "queued" ||
        run.status === "running"
      );
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
            <span className="rounded-full bg-line px-1.5 py-0.5 text-[10px]">{allRuns.length}{hasMore ? "+" : ""}</span>
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

          {/* Bibliothèque : agents gardés depuis l'extension, relançables. */}
          {savedAgents.length > 0 && (
            <>
              <p className="px-2 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                Agents sauvegardés
              </p>
              {savedAgents.map((a) => (
                <div
                  key={a.id}
                  className={`group flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                    selectedAgent === a.id ? "bg-accent/10" : "hover:bg-card2"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedAgent(a.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="text-accent">🤖</span>
                    <span className={`truncate font-medium ${selectedAgent === a.id ? "text-accent" : "text-ink-soft"}`}>
                      {a.title}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setScheduleError(null);
                      setSchedulingFor(schedulingFor === a.id ? null : a.id);
                    }}
                    title={schedules[a.id] ? schedules[a.id].label : "Planifier cet agent"}
                    className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                      schedules[a.id]
                        ? "border-success/40 bg-success/10 text-success hover:bg-success/20"
                        : "border-line bg-card2 text-ink-soft hover:text-ink"
                    }`}
                  >
                    🕘
                  </button>
                  <button
                    type="button"
                    onClick={() => launchSavedAgent(a)}
                    disabled={launchingAgent === a.id}
                    title="Relancer cet agent"
                    className="shrink-0 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
                  >
                    {launchingAgent === a.id ? "…" : "▶ Relancer"}
                  </button>
                </div>
              ))}
              {/* Planning : la table scheduled_runs et le cron existaient déjà,
                  il manquait le seul moyen d'y écrire. */}
              {schedulingFor ? (
                <div className="mx-2 mt-1 rounded-lg border border-line bg-card2 p-3">
                  {schedules[schedulingFor] ? (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-success">
                          {schedules[schedulingFor].label}
                        </p>
                        {schedules[schedulingFor].nextRunAt ? (
                          <p className="truncate text-[11px] text-ink-faint">
                            Prochaine fois :{" "}
                            {new Date(schedules[schedulingFor].nextRunAt as string).toLocaleString("fr-FR")}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        disabled={scheduleBusy}
                        onClick={() =>
                          removeSchedule(schedulingFor, schedules[schedulingFor].id)
                        }
                        className="shrink-0 rounded-md border border-destructive/40 px-2 py-1 text-[11px] font-semibold text-destructive disabled:opacity-50"
                      >
                        Supprimer
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={scheduleKind}
                          onChange={(e) => setScheduleKind(e.target.value as "daily" | "weekly")}
                          className="rounded-md border border-line bg-card px-2 py-1 text-xs text-ink"
                        >
                          <option value="daily">Chaque jour</option>
                          <option value="weekly">Chaque semaine</option>
                        </select>
                        {scheduleKind === "weekly" ? (
                          <select
                            value={scheduleDay}
                            onChange={(e) => setScheduleDay(Number(e.target.value))}
                            className="rounded-md border border-line bg-card px-2 py-1 text-xs text-ink"
                          >
                            {["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"].map(
                              (d, i) => (
                                <option key={d} value={i}>
                                  {d}
                                </option>
                              ),
                            )}
                          </select>
                        ) : null}
                        <input
                          type="time"
                          value={scheduleTime}
                          onChange={(e) => setScheduleTime(e.target.value)}
                          className="rounded-md border border-line bg-card px-2 py-1 text-xs text-ink"
                        />
                        <button
                          type="button"
                          disabled={scheduleBusy}
                          onClick={() => saveSchedule(schedulingFor)}
                          className="rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent disabled:opacity-50"
                        >
                          {scheduleBusy ? "…" : "Planifier"}
                        </button>
                      </div>
                      <p className="pt-1.5 text-[11px] text-ink-faint">Heure de Paris.</p>
                    </>
                  )}
                  {scheduleError ? (
                    <p className="pt-1.5 text-[11px] text-destructive">{scheduleError}</p>
                  ) : null}
                </div>
              ) : null}
              {launchError ? (
                <p className="px-3 pt-1 text-xs text-destructive">{launchError}</p>
              ) : null}
            </>
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
                  filter === f.id ? "bg-accent text-accent-ink" : "bg-card2 text-ink-soft"
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
            description="Donne un ordre dans l'assistant (Prompta partout ou /quick) — les missions et réponses apparaissent ici."
            action={
              <Link href="/quick" className="text-sm font-medium text-accent hover:underline">
                Ouvrir l&apos;assistant →
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
                      className="flex items-center gap-1 rounded-lg bg-warning px-3 py-1.5 text-xs font-semibold text-accent-ink hover:bg-warning/90"
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
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-xs font-medium text-ink-soft hover:bg-card2 disabled:opacity-50"
              >
                {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Charger plus d&apos;historique
              </button>
            </div>
          )}
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
