"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Pencil, Play, Rocket, ShoppingBag, Sparkles, Trash2, User, X } from "lucide-react";
import type { LibraryListing, LibrarySource } from "@/lib/library/user-listings";
import { TypeBadge, PriceTag, EmptyState } from "@/components/ui";
import { AgentRunConsole } from "@/components/run/AgentRunConsole";

const TABS: { id: LibrarySource; label: string; icon: typeof User }[] = [
  { id: "created", label: "Mes créations", icon: Sparkles },
  { id: "purchased", label: "Achetés", icon: ShoppingBag },
  { id: "subscribed", label: "Abonnements", icon: Play },
];

interface Props {
  created: LibraryListing[];
  purchased: LibraryListing[];
  subscribed: LibraryListing[];
}

export function LibraryTabs({ created, purchased, subscribed }: Props) {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as LibrarySource) || "created";
  const [tab, setTab] = useState<LibrarySource>(initialTab);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = searchParams.get("tab") as LibrarySource;
    if (t && TABS.some((x) => x.id === t)) setTab(t);
  }, [searchParams]);

  const lists = {
    created: created.filter((i) => i.status !== "deleted" && !deletedIds.has(i.id)),
    purchased,
    subscribed,
  };
  const items = lists[tab];

  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b border-line pb-3">
        {TABS.map(({ id, label, icon: Icon }) => {
          const count = lists[id].length;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                tab === id
                  ? "bg-accent text-white"
                  : "bg-card2 text-ink-soft hover:text-ink"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  tab === id ? "bg-white/20" : "bg-line"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {items.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={
              tab === "created"
                ? "Vous n'avez pas encore créé de prompt ou agent."
                : tab === "purchased"
                  ? "Aucun achat unique pour le moment."
                  : "Aucun abonnement actif à un agent."
            }
            action={
              tab === "created" ? (
                <Link
                  href="/dashboard/new"
                  className="text-sm font-medium text-accent hover:underline"
                >
                  Créer un agent →
                </Link>
              ) : (
                <Link
                  href="/explore"
                  className="text-sm font-medium text-accent hover:underline"
                >
                  Explorer le catalogue →
                </Link>
              )
            }
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <LibraryCard
              key={`${item.source}-${item.id}`}
              item={item}
              tab={tab}
              onDeleted={(id) => setDeletedIds((s) => new Set(s).add(id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LibraryCard({
  item,
  tab,
  onDeleted,
}: {
  item: LibraryListing;
  tab: LibrarySource;
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const isAgent = item.type !== "prompt";

  const href =
    tab === "created"
      ? `/dashboard/listing/${item.id}/edit`
      : `/listing/${item.slug}`;

  async function handleLaunch() {
    setLaunching(true);
    setLaunchError(null);
    try {
      const vRes = await fetch(`/api/listings/${item.id}/run-version`);
      const vData = await vRes.json();
      if (!vRes.ok) {
        setLaunchError(vData.error ?? "Version introuvable");
        return;
      }
      const res = await fetch("/api/run/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: item.id,
          versionId: vData.versionId,
          inputs: {},
          async: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Config incomplète (inputs/ressources requis) → renvoyer au masque complet.
        setLaunchError(
          data.message ??
            "Cet agent demande des informations avant le lancement. Ouvrez le masque de lancement.",
        );
        return;
      }
      setRunId(data.runId ?? data.run_id ?? null);
    } catch {
      setLaunchError("Lancement impossible. Réessayez.");
    } finally {
      setLaunching(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    const res = await fetch(`/api/listings/${item.id}`, { method: "DELETE" });
    if (res.ok) {
      onDeleted(item.id);
    } else {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "Erreur lors de la suppression");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-card p-4 transition hover:border-accent/40">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={item.type as "prompt" | "agent" | "workflow"} />
            {tab === "created" && item.status && (
              <span className="rounded-full bg-line px-2 py-0.5 text-[10px] capitalize text-ink-soft">
                {item.status}
              </span>
            )}
            {item.provisioning_mode === "managed" && (
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">
                Clé en main
              </span>
            )}
          </div>
          <h3 className="mt-2 truncate font-medium text-ink">{item.title}</h3>
          {item.acquired_at && tab !== "created" && (
            <p className="mt-0.5 text-[11px] text-ink-faint">
              Depuis {new Date(item.acquired_at).toLocaleDateString("fr-FR")}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          {item.pricing_mode === "subscription" && item.subscription_price_cents > 0 ? (
            <span className="text-sm font-bold text-ink">
              {(item.subscription_price_cents / 100).toFixed(2)} €
              <span className="text-xs font-normal text-ink-soft">/mois</span>
            </span>
          ) : (
            <PriceTag priceCents={item.price_cents} size="sm" />
          )}
        </div>
      </div>

      {item.hosting_fee_cents > 0 && tab === "created" && (
        <p className="mt-2 text-[11px] text-ink-faint">
          Hébergement : {(item.hosting_fee_cents / 100).toFixed(2)} €/mois
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={href}
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white"
        >
          {tab === "created" ? (
            <>
              <Pencil className="h-3.5 w-3.5" /> Éditer
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" /> Lancer
            </>
          )}
        </Link>
        {isAgent && (
          <button
            type="button"
            onClick={handleLaunch}
            disabled={launching}
            title="Démarre l'agent en tâche de fond — vous pouvez fermer la fenêtre, il continue."
            className="inline-flex items-center gap-1 rounded-lg border border-accent px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/5 disabled:opacity-50"
          >
            {launching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Rocket className="h-3.5 w-3.5" />
            )}
            Lancer en fond
          </button>
        )}
        {(tab === "created" || tab === "purchased" || tab === "subscribed") &&
          item.type !== "prompt" &&
          item.status === "published" && (
            <Link
              href={`/listing/${item.slug}?run=1`}
              className="inline-flex items-center gap-1 rounded-lg border border-accent px-3 py-1.5 text-xs font-medium text-accent"
            >
              <Play className="h-3.5 w-3.5" /> Lancer
            </Link>
          )}
        {item.status === "published" && (
          <Link
            href={`/listing/${item.slug}`}
            className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs text-ink-soft hover:text-ink"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Fiche
          </Link>
        )}
        {tab === "created" && (
          <button
            type="button"
            onClick={handleDelete}
            onBlur={() => setConfirmDelete(false)}
            disabled={deleting}
            className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              confirmDelete
                ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                : "border-line text-ink-soft hover:text-red-600 hover:border-red-200"
            }`}
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            {confirmDelete ? "Confirmer" : "Supprimer"}
          </button>
        )}
      </div>

      {launchError && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span className="flex-1">{launchError}</span>
          <Link href={`/listing/${item.slug}?run=1`} className="font-medium underline">
            Ouvrir le masque de lancement →
          </Link>
        </div>
      )}

      {runId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-card shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-sm font-semibold text-ink">Exécution — {item.title}</p>
              <div className="flex items-center gap-3">
                <Link
                  href={`/dashboard/runs/${runId}`}
                  className="text-xs text-accent hover:underline"
                >
                  Détail &amp; logs →
                </Link>
                <button
                  type="button"
                  onClick={() => setRunId(null)}
                  className="rounded-lg p-1 text-ink-soft hover:bg-card2"
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-4">
              <p className="mb-3 rounded-lg bg-card2 px-3 py-2 text-xs text-ink-soft">
                ⚡ L&apos;agent tourne en tâche de fond. Vous pouvez fermer cette fenêtre — il
                continue. Retrouvez-le (et arrêtez-le) dans{" "}
                <Link href="/dashboard/runs" className="font-medium text-accent hover:underline">
                  Runs &amp; logs
                </Link>
                .
              </p>
              <AgentRunConsole runId={runId} status="queued" pollWhileRunning title={item.title} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
