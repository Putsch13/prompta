"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ExternalLink, Pencil, Play, ShoppingBag, Sparkles, User } from "lucide-react";
import type { LibraryListing, LibrarySource } from "@/lib/library/user-listings";
import { TypeBadge, PriceTag } from "@/components/ui";

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

  useEffect(() => {
    const t = searchParams.get("tab") as LibrarySource;
    if (t && TABS.some((x) => x.id === t)) setTab(t);
  }, [searchParams]);

  const lists = { created, purchased, subscribed };
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
        <div className="mt-8 rounded-xl border border-dashed border-line py-12 text-center">
          <p className="text-sm text-ink-soft">
            {tab === "created" && "Vous n'avez pas encore créé de prompt ou agent."}
            {tab === "purchased" && "Aucun achat unique pour le moment."}
            {tab === "subscribed" && "Aucun abonnement actif à un agent."}
          </p>
          {tab === "created" && (
            <Link
              href="/dashboard/new"
              className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
            >
              Créer un agent →
            </Link>
          )}
          {tab !== "created" && (
            <Link
              href="/explore"
              className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
            >
              Explorer le catalogue →
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <LibraryCard key={`${item.source}-${item.id}`} item={item} tab={tab} />
          ))}
        </div>
      )}
    </div>
  );
}

function LibraryCard({ item, tab }: { item: LibraryListing; tab: LibrarySource }) {
  const href =
    tab === "created"
      ? `/dashboard/listing/${item.id}/edit`
      : `/listing/${item.slug}`;

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

      <div className="mt-3 flex gap-2">
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
        {item.status === "published" && (
          <Link
            href={`/listing/${item.slug}`}
            className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs text-ink-soft hover:text-ink"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Fiche
          </Link>
        )}
      </div>
    </div>
  );
}
