"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ExternalLink, CreditCard, Sparkles, Loader2 } from "lucide-react";
import { PROMPTA_PRO_PRICE_CENTS } from "@/lib/stripe-plans";
import { isSubscriptionAccessActive } from "@/lib/subscriptions/active";

interface Subscription {
  id: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end?: boolean;
  cancel_requested_at?: string | null;
  listing: { title: string; slug: string } | null;
}

interface PlatformSub {
  status: string;
  plan: string;
  current_period_end: string | null;
  cancel_at_period_end?: boolean;
  cancel_requested_at?: string | null;
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("fr-FR");
}

function subscriptionStatusLabel(sub: {
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: string | null;
}): { text: string; className: string } {
  if (sub.cancel_at_period_end && isSubscriptionAccessActive(sub)) {
    const end = formatDate(sub.current_period_end);
    return {
      text: end ? `Annulation prévue le ${end}` : "Annulation programmée",
      className: "text-amber-600",
    };
  }
  if (sub.status === "active" || sub.status === "trialing") {
    return { text: "Actif", className: "text-green-600" };
  }
  if (sub.status === "canceled") {
    return { text: "Annulé", className: "text-ink-faint" };
  }
  return { text: sub.status, className: "text-amber-600" };
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

  const [cancellingPro, setCancellingPro] = useState(false);
  const [cancellingSubId, setCancellingSubId] = useState<string | null>(null);

  async function cancelPro() {
    if (
      !confirm(
        "Annuler Prompta Pro ? Vous conservez l'accès jusqu'à la fin de la période déjà payée.",
      )
    ) {
      return;
    }
    setCancellingPro(true);
    const res = await fetch("/api/platform-subscription/cancel", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setPlatformSub((s) =>
        s
          ? {
              ...s,
              status: "active",
              cancel_at_period_end: true,
              current_period_end: data.current_period_end ?? s.current_period_end,
            }
          : s,
      );
    } else {
      const d = await res.json().catch(() => null);
      alert(d?.error ?? "Erreur");
    }
    setCancellingPro(false);
  }

  async function cancelSub(subId: string) {
    if (
      !confirm(
        "Annuler cet abonnement ? Vous conservez l'accès jusqu'à la fin de la période en cours.",
      )
    ) {
      return;
    }
    setCancellingSubId(subId);
    const res = await fetch(`/api/subscriptions/${subId}/cancel`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setSubscriptions((subs) =>
        subs.map((s) =>
          s.id === subId
            ? {
                ...s,
                status: "active",
                cancel_at_period_end: true,
                current_period_end: data.current_period_end ?? s.current_period_end,
              }
            : s,
        ),
      );
    } else {
      const d = await res.json().catch(() => null);
      alert(d?.error ?? "Erreur");
    }
    setCancellingSubId(null);
  }

  const isProActive = platformSub ? isSubscriptionAccessActive(platformSub) : false;
  const proStatus = platformSub ? subscriptionStatusLabel(platformSub) : null;
  const activeSubscriptions = subscriptions.filter((s) => isSubscriptionAccessActive(s));

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">Mes abonnements</h1>
          <p className="mt-2 text-ink-soft">Gérez Prompta Pro et vos abonnements aux agents.</p>
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
              <h2 className="font-display text-lg font-semibold text-ink">Prompta Pro</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Accès à tout le catalogue d&apos;agents —{" "}
                {(PROMPTA_PRO_PRICE_CENTS / 100).toFixed(2)} €/mois
              </p>
              {isProActive && proStatus && (
                <p className={`mt-1 text-xs ${proStatus.className}`}>
                  {proStatus.text}
                  {!platformSub?.cancel_at_period_end && platformSub?.current_period_end && (
                    <>
                      {" "}
                      · renouvellement le {formatDate(platformSub.current_period_end)}
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
          {!isProActive ? (
            <button
              onClick={subscribePro}
              disabled={loadingPro}
              className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {loadingPro ? <Loader2 className="h-4 w-4 animate-spin" /> : "Souscrire à Pro"}
            </button>
          ) : !platformSub?.cancel_at_period_end ? (
            <button
              onClick={cancelPro}
              disabled={cancellingPro}
              className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {cancellingPro ? <Loader2 className="h-4 w-4 animate-spin" /> : "Se désabonner"}
            </button>
          ) : null}
        </div>
      </div>

      {activeSubscriptions.length === 0 ? (
        <div className="rounded-xl border border-line bg-card p-12 text-center">
          <p className="font-display text-lg font-semibold text-ink">Aucun abonnement actif</p>
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
          {activeSubscriptions.map((sub) => {
            const status = subscriptionStatusLabel(sub);
            return (
              <div
                key={sub.id}
                className="flex items-center justify-between rounded-xl border border-line bg-card p-4"
              >
                <div>
                  <p className="font-medium text-ink">{sub.listing?.title ?? "Agent"}</p>
                  <p className="text-sm text-ink-soft">
                    <span className={status.className}>{status.text}</span>
                    {!sub.cancel_at_period_end && sub.current_period_end && (
                      <>
                        {" "}
                        · Renouvellement le {formatDate(sub.current_period_end)}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {!sub.cancel_at_period_end && (
                    <button
                      onClick={() => cancelSub(sub.id)}
                      disabled={cancellingSubId === sub.id}
                      className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                    >
                      {cancellingSubId === sub.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Annuler"
                      )}
                    </button>
                  )}
                  {sub.listing && (
                    <Link
                      href={`/listing/${sub.listing.slug}`}
                      className="flex items-center gap-1 text-sm text-accent hover:underline"
                    >
                      Ouvrir <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
