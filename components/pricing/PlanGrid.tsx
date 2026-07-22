"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

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
        // signup lit `redirect` (pas `next`) — sinon le visiteur non connecté
        // qui clique un plan payant ne revient jamais finaliser.
        router.push(`/signup?redirect=${encodeURIComponent("/pricing")}`);
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
    <div className="grid items-stretch gap-6 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan, i) => (
        <div
          key={plan.id}
          style={{ animationDelay: `${i * 90}ms` }}
          className={`hud-card relative flex animate-fade-up flex-col p-6 ${
            plan.highlight
              ? "hud-corners border-accent/60 shadow-glow xl:scale-[1.03]"
              : ""
          }`}
        >
          {plan.highlight && (
            <span className="hud-label absolute -top-[9px] left-1/2 -translate-x-1/2 whitespace-nowrap border border-accent/40 bg-bg px-3 py-0.5">
              Le plus choisi
            </span>
          )}
          <h3 className="font-display text-lg font-bold text-ink">{plan.label}</h3>
          <p className="mt-1 min-h-[40px] text-sm text-ink-soft">{plan.tagline}</p>
          <p className="mt-4">
            <span className="font-display text-4xl font-bold text-ink">
              {plan.priceCents === 0 ? "0 €" : `${(plan.priceCents / 100).toLocaleString("fr-FR")} €`}
            </span>
            <span className="text-sm text-ink-faint"> /mois</span>
          </p>
          <div
            aria-hidden
            className={`mt-5 h-px w-full ${
              plan.highlight
                ? "bg-gradient-to-r from-transparent via-accent/50 to-transparent"
                : "bg-line"
            }`}
          />
          <ul className="mt-5 flex-1 space-y-2.5">
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
            className={`mt-8 flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-60 ${
              plan.highlight || plan.id === "free"
                ? "bg-accent text-accent-ink shadow-glow-sm hover:bg-accent-hover hover:shadow-glow"
                : "border border-line bg-card2 text-ink hover:border-accent/50 hover:shadow-glow-sm"
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
