"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Sparkles } from "lucide-react";

export interface PlanCardData {
  id: string;
  label: string;
  priceCents: number;
  tagline: string;
  features: string[];
  highlight?: boolean;
}

export function PlanGrid({ plans }: { plans: PlanCardData[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function subscribe(planId: string) {
    if (planId === "free") {
      router.push("/signup");
      return;
    }
    setLoading(planId);
    try {
      const res = await fetch("/api/stripe/platform-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });
      if (res.status === 401) {
        router.push(`/signup?next=${encodeURIComponent("/pricing")}`);
        return;
      }
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      alert(data.error ?? "Impossible de démarrer l'abonnement");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan) => (
        <div
          key={plan.id}
          className={`relative flex flex-col rounded-2xl border bg-card p-6 ${
            plan.highlight
              ? "border-accent shadow-lg shadow-accent/10 ring-1 ring-accent/30"
              : "border-line"
          }`}
        >
          {plan.highlight && (
            <span className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-white">
              <Sparkles className="h-3 w-3" /> Le plus choisi
            </span>
          )}
          <h3 className="font-display text-lg font-bold text-ink">{plan.label}</h3>
          <p className="mt-1 min-h-[40px] text-sm text-ink-soft">{plan.tagline}</p>
          <p className="mt-4">
            <span className="font-display text-4xl font-bold text-ink">
              {plan.priceCents === 0 ? "0 €" : `${(plan.priceCents / 100).toLocaleString("fr-FR")} €`}
            </span>
            <span className="text-sm text-ink-faint"> / mois</span>
          </p>
          <ul className="mt-6 flex-1 space-y-2.5">
            {plan.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-ink-soft">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                {f}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void subscribe(plan.id)}
            disabled={loading !== null}
            className={`mt-8 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 ${
              plan.highlight || plan.id === "free"
                ? "bg-accent text-white hover:bg-accent/90"
                : "border border-line bg-card text-ink hover:border-accent"
            }`}
          >
            {loading === plan.id && <Loader2 className="h-4 w-4 animate-spin" />}
            {plan.id === "free" ? "Commencer gratuitement" : `Choisir ${plan.label}`}
          </button>
        </div>
      ))}
    </div>
  );
}
