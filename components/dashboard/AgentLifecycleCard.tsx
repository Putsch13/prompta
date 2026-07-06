"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Pencil,
  Play,
  History,
  Package,
  Loader2,
  Rocket,
  ArrowRight,
  Trash2,
} from "lucide-react";
import { StatusPill, statusTone } from "@/components/ui";
import type { AgentOverview } from "@/lib/library/agent-overview";

const RUN_LABELS: Record<string, string> = {
  pending: "En attente",
  running: "En cours",
  awaiting_approval: "Validation requise",
  completed: "Terminé",
  failed: "Échoué",
  suspended: "Suspendu",
  cancelled: "Annulé",
};

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}

export function AgentLifecycleCard({
  agent,
  onDeleted,
}: {
  agent: AgentOverview;
  onDeleted: (id: string) => void;
}) {
  const [launching, setLaunching] = useState(false);
  const [launchedRunId, setLaunchedRunId] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [needsMask, setNeedsMask] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const inProduction = agent.status === "published";
  const last = agent.lastRun;

  async function quickLaunch() {
    setLaunching(true);
    setLaunchError(null);
    try {
      const vRes = await fetch(`/api/listings/${agent.id}/run-version`);
      const vData = await vRes.json();
      if (!vRes.ok) {
        setLaunchError(vData.error ?? "Version introuvable — ouvre l'agent pour le mettre en production.");
        return;
      }
      const res = await fetch("/api/run/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: agent.id, versionId: vData.versionId, inputs: {}, async: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLaunchError(data.message ?? "Cet agent a besoin d'informations avant de démarrer.");
        setNeedsMask(true);
        return;
      }
      setLaunchedRunId(data.runId ?? null);
    } catch {
      setLaunchError("Lancement impossible. Réessaie.");
    } finally {
      setLaunching(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    setDeleting(true);
    const res = await fetch(`/api/listings/${agent.id}`, { method: "DELETE" });
    if (res.ok) onDeleted(agent.id);
    else {
      const d = await res.json().catch(() => null);
      alert(d?.error ?? "Suppression impossible");
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col rounded-2xl border border-line bg-card p-5 transition-all hover:border-accent/40 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display font-semibold text-ink">{agent.title}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatusPill tone={inProduction ? "success" : agent.status === "under_review" ? "warning" : "neutral"}>
              {inProduction ? "En production" : agent.status === "under_review" ? "En revue" : "Brouillon"}
            </StatusPill>
            {agent.runCount > 0 && (
              <span className="text-xs text-ink-faint">{agent.runCount} run{agent.runCount > 1 ? "s" : ""}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className={`shrink-0 rounded-lg p-1.5 text-xs ${
            confirmDelete
              ? "bg-red-600 px-2 font-medium text-white"
              : "text-ink-faint hover:bg-red-50 hover:text-red-600"
          }`}
          aria-label="Supprimer"
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : confirmDelete ? "Confirmer ?" : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* ── Dernier run : le pouls de l'agent ── */}
      {last ? (
        <Link
          href={`/dashboard/runs/${last.id}`}
          className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-card2/60 px-3 py-2.5 text-sm transition-colors hover:border-accent/40"
        >
          <StatusPill tone={statusTone(last.status)}>{RUN_LABELS[last.status] ?? last.status}</StatusPill>
          <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">
            Dernier run {timeAgo(last.created_at)}
            {last.status === "completed" && last.deliverables > 0 && (
              <span className="ml-1 inline-flex items-center gap-1 font-medium text-accent">
                <Package className="h-3 w-3" /> {last.deliverables} livrable{last.deliverables > 1 ? "s" : ""}
              </span>
            )}
          </span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
        </Link>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-line px-3 py-2.5 text-xs text-ink-faint">
          Jamais lancé — teste-le pour voir son premier dossier de mission.
        </p>
      )}

      {launchedRunId && (
        <Link
          href={`/dashboard/runs/${launchedRunId}`}
          className="mt-2 flex items-center gap-1.5 rounded-lg bg-accent-light px-3 py-2 text-xs font-medium text-accent"
        >
          <Rocket className="h-3.5 w-3.5" /> Lancé ! Suivre en direct →
        </Link>
      )}
      {launchError && (
        <div className="mt-2 space-y-1.5">
          <p className="text-xs text-destructive">{launchError}</p>
          {needsMask && (
            <Link
              href={`/listing/${agent.slug}?run=1`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
            >
              Compléter les infos et lancer <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line-soft pt-3">
        <Link
          href={`/dashboard/listing/${agent.id}/edit`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover"
        >
          <Pencil className="h-3.5 w-3.5" /> Modifier
        </Link>
        {inProduction && (
          <button
            type="button"
            onClick={() => void quickLaunch()}
            disabled={launching}
            title="Démarre en tâche de fond — si l'agent a besoin d'infos, on te les demande."
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/5 disabled:opacity-50"
          >
            {launching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Lancer
          </button>
        )}
        <Link
          href={`/dashboard/runs?agent=${agent.id}`}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-ink-soft hover:border-accent hover:text-accent"
        >
          <History className="h-3.5 w-3.5" /> Historique
        </Link>
      </div>
    </div>
  );
}
