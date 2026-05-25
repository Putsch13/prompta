"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ExternalLink, CreditCard } from "lucide-react";

interface Subscription {
  id: string;
  status: string;
  current_period_end: string | null;
  listing: { title: string; slug: string } | null;
}

export default function AbonnementsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loadingPortal, setLoadingPortal] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/subscriptions");
      if (res.ok) {
        const data = await res.json();
        setSubscriptions(data.subscriptions ?? []);
      }
    }
    load();
  }, []);

  async function openPortal() {
    setLoadingPortal(true);
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    setLoadingPortal(false);
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">
            Mes abonnements
          </h1>
          <p className="mt-2 text-ink-soft">
            Gérez vos abonnements aux agents.
          </p>
        </div>
        <button
          onClick={openPortal}
          disabled={loadingPortal}
          className="flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-card2"
        >
          <CreditCard className="h-4 w-4" />
          {loadingPortal ? "Chargement…" : "Portail Stripe"}
        </button>
      </div>

      {subscriptions.length === 0 ? (
        <div className="rounded-xl border border-line bg-card p-12 text-center">
          <p className="font-display text-lg font-semibold text-ink">
            Aucun abonnement actif
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            Abonnez-vous à un agent pour l&apos;exécuter en illimité.
          </p>
          <Link
            href="/explore"
            className="mt-6 inline-block rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white"
          >
            Explorer les agents
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {subscriptions.map((sub) => (
            <div
              key={sub.id}
              className="flex items-center justify-between rounded-xl border border-line bg-card p-4"
            >
              <div>
                <p className="font-medium text-ink">
                  {sub.listing?.title ?? "Agent"}
                </p>
                <p className="text-sm text-ink-soft">
                  Statut :{" "}
                  <span
                    className={
                      sub.status === "active" ? "text-green-600" : "text-amber-600"
                    }
                  >
                    {sub.status}
                  </span>
                  {sub.current_period_end && (
                    <> · Renouvellement le{" "}
                    {new Date(sub.current_period_end).toLocaleDateString("fr-FR")}
                    </>
                  )}
                </p>
              </div>
              {sub.listing && (
                <Link
                  href={`/listing/${sub.listing.slug}`}
                  className="flex items-center gap-1 text-sm text-accent hover:underline"
                >
                  Ouvrir <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
