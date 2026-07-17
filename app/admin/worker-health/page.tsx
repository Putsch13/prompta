"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  RefreshCw,
  Server,
  XCircle,
  Zap,
} from "lucide-react";

interface HealthStats {
  pendingRuns: number;
  runningRuns: number;
  staleRuns: number;
  failedLast24h: number;
  recentRuns: RecentRun[];
}

interface RecentRun {
  id: string;
  status: string;
  listing_title: string | null;
  user_email: string | null;
  created_at: string;
  started_at: string | null;
  heartbeat_at: string | null;
  claimed_by: string | null;
  steps_completed: number;
  error_message: string | null;
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-warning",
    running: "bg-accent animate-pulse",
    completed: "bg-success",
    failed: "bg-destructive",
    suspended: "bg-warning",
    awaiting_approval: "bg-accent-dim",
  };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status] ?? "bg-ink-faint"}`} />;
}

function ago(dateStr: string | null): string {
  if (!dateStr) return "—";
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}min`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}j`;
}

export default function WorkerHealthPage() {
  const [stats, setStats] = useState<HealthStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [reaping, setReaping] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/worker-health");
      if (res.ok) setStats(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleReap() {
    setReaping(true);
    try {
      await fetch("/api/admin/worker-health/reap", { method: "POST" });
      await load();
    } finally {
      setReaping(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Santé Worker</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Monitoring des runs agents en temps réel
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReap}
            disabled={reaping || !stats?.staleRuns}
            className="flex items-center gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-40"
          >
            {reaping ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Nettoyer stale ({stats?.staleRuns ?? 0})
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink shadow-glow-sm hover:bg-accent-hover"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </button>
        </div>
      </div>

      {!stats ? (
        <div className="flex items-center gap-2 py-12 text-ink-soft">
          <Loader2 className="h-5 w-5 animate-spin" /> Chargement…
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<Clock className="h-5 w-5 text-warning" />}
              label="Pending"
              value={stats.pendingRuns}
              color="amber"
            />
            <StatCard
              icon={<Zap className="h-5 w-5 text-accent" />}
              label="Running"
              value={stats.runningRuns}
              color="blue"
            />
            <StatCard
              icon={<AlertTriangle className="h-5 w-5 text-destructive" />}
              label="Stale"
              value={stats.staleRuns}
              color="red"
            />
            <StatCard
              icon={<XCircle className="h-5 w-5 text-destructive" />}
              label="Failed (24h)"
              value={stats.failedLast24h}
              color="red"
            />
          </div>

          <div className="mt-8">
            <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <Activity className="h-5 w-5" /> Runs récents
            </h2>
            {stats.recentRuns.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line py-8 text-center text-sm text-ink-soft">
                Aucun run récent
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-card2 text-left text-xs uppercase text-ink-faint">
                      <th className="px-4 py-3">Statut</th>
                      <th className="px-4 py-3">Agent</th>
                      <th className="px-4 py-3">Utilisateur</th>
                      <th className="px-4 py-3">Steps</th>
                      <th className="px-4 py-3">Créé</th>
                      <th className="px-4 py-3">Heartbeat</th>
                      <th className="px-4 py-3">Worker</th>
                      <th className="px-4 py-3">Erreur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentRuns.map((run) => (
                      <tr key={run.id} className="border-b border-line last:border-0 hover:bg-card2/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <StatusDot status={run.status} />
                            <span className="capitalize">{run.status}</span>
                          </div>
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-3 font-medium">
                          {run.listing_title ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-ink-soft">{run.user_email ?? "—"}</td>
                        <td className="px-4 py-3">{run.steps_completed}</td>
                        <td className="px-4 py-3 text-ink-faint">{ago(run.created_at)}</td>
                        <td className="px-4 py-3 text-ink-faint">{ago(run.heartbeat_at)}</td>
                        <td className="px-4 py-3 font-mono text-[11px] text-ink-faint">
                          {run.claimed_by?.slice(0, 16) ?? "—"}
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-3 text-xs text-destructive">
                          {run.error_message ?? ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center gap-3 rounded-xl border border-line bg-card p-4">
            <Server className="h-5 w-5 text-ink-soft" />
            <div className="text-sm text-ink-soft">
              <p>
                Le reaper supprime les runs{" "}
                <span className="font-medium text-ink">running</span> sans heartbeat depuis{" "}
                <span className="font-medium text-ink">5 min</span>.
              </p>
              <p className="mt-0.5">
                Heartbeat worker : toutes les <span className="font-medium text-ink">5 secondes</span>.
                Auto-refresh : <span className="font-medium text-ink">10 secondes</span>.
              </p>
            </div>
            <CheckCircle className="ml-auto h-5 w-5 text-success" />
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  const borderColors: Record<string, string> = {
    amber: "border-warning/30",
    blue: "border-accent/30",
    red: "border-destructive/30",
    green: "border-success/30",
  };

  return (
    <div className={`rounded-xl border ${borderColors[color] ?? "border-line"} bg-card p-5`}>
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="text-2xl font-bold text-ink">{value}</p>
          <p className="text-xs text-ink-soft">{label}</p>
        </div>
      </div>
    </div>
  );
}
