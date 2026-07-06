"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CreditCard, Sparkles, Loader2, Bot, Coins } from "lucide-react";
import { isSubscriptionAccessActive } from "@/lib/subscriptions/active";
import { PLANS, PLAN_ORDER } from "@/lib/billing/plans";
import { PlanGrid } from "@/components/pricing/PlanGrid";

interface PlatformSub {
  status: string;
  plan: string;
  current_period_end: string | null;
  cancel_at_period_end?: boolean;
  cancel_requested_at?: string | null;
}

interface PlanInfo {
  id: string;
  label: string;
  priceCents: number;
  publishedAgentLimit: number | null;
  monthlyCreditCents: number;
  unrestricted: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
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
  const [platformSub, setPlatformSub] = useState<PlatformSub | null>(null);
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [publishedAgents, setPublishedAgents] = useState(0);
  const [loadingPortal, setLoadingPortal] = useState(false);

  useEffect(() => {
    async function load() {
      const proRes = await fetch("/api/platform-subscription");
      if (proRes.ok) {
        const data = await proRes.json();
        setPlatformSub(data.subscription ?? null);
        setPlanInfo(data.plan ?? null);
        setPublishedAgents(data.usage?.publishedAgents ?? 0);
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

  const [cancellingPro, setCancellingPro] = useState(false);

  async function cancelPro() {
    if (
      !confirm(
        "Annuler ton plan ? Tu conserves l'accès jusqu'à la fin de la période déjà payée.",
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

  const isProActive = platformSub ? isSubscriptionAccessActive(platformSub) : false;
  const proStatus = platformSub ? subscriptionStatusLabel(platformSub) : null;

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">Mon plan</h1>
          <p className="mt-2 text-ink-soft">Ton plan d&apos;hébergement d&apos;agents et ta facturation.</p>
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

      {/* ── Mon plan Prompta ─────────────────────────────────────────── */}
      <div className="mb-8 rounded-xl border border-accent/30 bg-accent/5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-1 h-6 w-6 text-accent" />
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">
                Plan {planInfo?.label ?? "…"}
                {planInfo && planInfo.priceCents > 0 && (
                  <span className="ml-2 text-sm font-normal text-ink-soft">
                    {(planInfo.priceCents / 100).toLocaleString("fr-FR")} €/mois
                  </span>
                )}
                {planInfo?.unrestricted && (
                  <span className="ml-2 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                    ADMIN ILLIMITÉ
                  </span>
                )}
              </h2>
              {planInfo && (
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft">
                  <span className="flex items-center gap-1.5">
                    <Bot className="h-4 w-4 text-accent" />
                    {publishedAgents}
                    {planInfo.publishedAgentLimit != null ? ` / ${planInfo.publishedAgentLimit}` : ""} agent
                    {publishedAgents > 1 ? "s" : ""} publié{publishedAgents > 1 ? "s" : ""}
                  </span>
                  {planInfo.monthlyCreditCents > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Coins className="h-4 w-4 text-accent" />
                      {(planInfo.monthlyCreditCents / 100).toLocaleString("fr-FR")} € de crédits IA / mois
                    </span>
                  )}
                </div>
              )}
              {isProActive && proStatus && (
                <p className={`mt-1 text-xs ${proStatus.className}`}>
                  {proStatus.text}
                  {!platformSub?.cancel_at_period_end && platformSub?.current_period_end && (
                    <> · renouvellement le {formatDate(platformSub.current_period_end)}</>
                  )}
                </p>
              )}
              <p className="mt-1 text-xs text-ink-faint">
                Astuce : tes propres clés API (BYOK) = runs illimités, zéro crédit consommé.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/pricing"
              className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent/90"
            >
              {planInfo && planInfo.priceCents > 0 ? "Changer de plan" : "Voir les plans"}
            </Link>
            {isProActive && !platformSub?.cancel_at_period_end && (
              <button
                onClick={cancelPro}
                disabled={cancellingPro}
                className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {cancellingPro ? <Loader2 className="h-4 w-4 animate-spin" /> : "Se désabonner"}
              </button>
            )}
          </div>
        </div>
      </div>


      {/* ── Toutes les formules, changement en un clic ─────────────────── */}
      <div className="mt-10">
        <h2 className="font-display text-xl font-bold text-ink">Les formules</h2>
        <p className="mb-4 mt-1 text-sm text-ink-soft">
          Change de plan à tout moment — effet immédiat à l&apos;upgrade, fin de période au
          downgrade.
        </p>
        <PlanGrid
          plans={PLAN_ORDER.map((id) => ({
            id: PLANS[id].id,
            label: PLANS[id].label,
            priceCents: PLANS[id].priceCents,
            tagline: PLANS[id].tagline,
            features: PLANS[id].features,
            highlight: PLANS[id].highlight,
          }))}
        />
      </div>
    </div>
  );
}