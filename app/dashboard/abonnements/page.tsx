"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ExternalLink, CreditCard, Sparkles, Loader2 } from "lucide-react";
import { PROMPTA_PRO_PRICE_CENTS } from "@/lib/stripe-plans";

interface Subscription {
  id: string;
  status: string;
  current_period_end: string | null;
  listing: { title: string; slug: string } | null;
}

interface PlatformSub {
  status: string;
  plan: string;
  current_period_end: string | null;
}

export default function AbonnementsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [platformSub, setPlatformSub] = useState<PlatformSub | null>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [loadingPro, setLoadingPro] = useState(false);

  useEffect(() => {
    async function load() {
      const [subsRes, proRes] = await Promise.all([
        fetch("/api/subscriptions"),
        fetch("/api/platform-subscription"),
      ]);
      if (subsRes.ok) {
        const data = await subsRes.json();
        setSubscriptions(data.subscriptions ?? []);
      }
      if (proRes.ok) {
        const data = await proRes.json();
        setPlatformSub(data.subscription ?? null);
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

  async function subscribePro() {
    setLoadingPro(true);
    const res = await fetch("/api/stripe/platform-subscribe", { method: "POST" });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    setLoadingPro(false);
  }

  const isProActive = platformSub?.status === "active";

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">
            Mes abonnements
          </h1>
          <p className="mt-2 text-ink-soft">
            Gérez Prompta Pro et vos abonnements aux agents.
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

      <div className="mb-8 rounded-xl border border-accent/30 bg-accent/5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-1 h-6 w-6 text-accent" />
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">
                Prompta Pro
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                Accès à tout le catalogue d&apos;agents —{" "}
                {(PROMPTA_PRO_PRICE_CENTS / 100).toFixed(2)} €/mois
              </p>
              {isProActive && platformSub?.current_period_end && (
                <p className="mt-1 text-xs text-green-600">
                  Actif · renouvellement le{" "}
                  {new Date(platformSub.current_period_end).toLocaleDateString("fr-FR")}
                </p>
              )}
            </div>
          </div>
          {!isProActive && (
            <button
              onClick={subscribePro}
              disabled={loadingPro}
              className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {loadingPro ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Souscrire à Pro"
              )}
            </button>
          )}
        </div>
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
