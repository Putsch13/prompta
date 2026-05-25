"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ORG_PLANS, type OrgPlanKey } from "@/lib/stripe-plans";

interface Props {
  orgSlug: string;
  currentPlan: string;
  subscriptionStatus: string;
  isAdmin: boolean;
}

export function OrgBillingPanel({
  orgSlug,
  currentPlan,
  subscriptionStatus,
  isAdmin,
}: Props) {
  const [loading, setLoading] = useState<OrgPlanKey | null>(null);

  if (!isAdmin) return null;

  async function subscribe(plan: OrgPlanKey) {
    setLoading(plan);
    const res = await fetch("/api/stripe/org-subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgSlug, plan }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    setLoading(null);
  }

  return (
    <section className="mt-8 rounded-xl border border-line bg-card p-6">
      <h2 className="font-display text-lg font-semibold text-ink">
        Abonnement entreprise
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Plan actuel : <strong>{currentPlan}</strong> ·{" "}
        {subscriptionStatus === "active" ? "Actif" : "Inactif"}
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {(Object.entries(ORG_PLANS) as [OrgPlanKey, (typeof ORG_PLANS)[OrgPlanKey]][]).map(
          ([key, plan]) => (
            <div
              key={key}
              className={`rounded-lg border p-4 ${currentPlan === key ? "border-accent bg-accent/5" : "border-line"}`}
            >
              <p className="font-display font-semibold text-ink">{plan.label}</p>
              <p className="mt-1 text-2xl font-bold text-ink">
                {(plan.priceCents / 100).toFixed(0)} €
                <span className="text-sm font-normal text-ink-soft">/mois</span>
              </p>
              <p className="mt-1 text-xs text-ink-soft">{plan.seats} sièges</p>
              <button
                onClick={() => subscribe(key)}
                disabled={loading === key}
                className="mt-4 w-full rounded-lg bg-accent py-2 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {loading === key ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  "Souscrire"
                )}
              </button>
            </div>
          )
        )}
      </div>
    </section>
  );
}
