"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Sparkles } from "lucide-react";

interface PlanInfo {
  label: string;
  publishedAgentLimit: number | null;
  unrestricted: boolean;
}

/** « X / Y agents en production sur ton plan » + CTA upgrade si plein. */
export function PlanQuotaCard() {
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [used, setUsed] = useState(0);

  useEffect(() => {
    fetch("/api/platform-subscription")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.plan) return;
        setPlan(d.plan);
        setUsed(d.usage?.publishedAgents ?? 0);
      })
      .catch(() => undefined);
  }, []);

  if (!plan) return null;
  const limit = plan.publishedAgentLimit;
  const full = !plan.unrestricted && limit != null && used >= limit;

  return (
    <div
      className={`rounded-xl border p-4 ${
        full ? "border-warning/30 bg-warning/10" : "border-accent/30 bg-accent/5"
      }`}
    >
      <p className="flex items-center gap-2 text-sm font-medium text-ink">
        <Bot className="h-4 w-4 text-accent" />
        {used}
        {limit != null && !plan.unrestricted ? ` / ${limit}` : ""} agent{used > 1 ? "s" : ""} en
        production sur ton plan {plan.label}
        {plan.unrestricted && (
          <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold text-accent">
            ILLIMITÉ
          </span>
        )}
      </p>
      {full ? (
        <p className="mt-1.5 text-xs text-warning">
          Quota atteint — cet agent sera enregistré en brouillon.{" "}
          <Link href="/pricing" className="font-semibold text-accent hover:underline">
            <Sparkles className="inline h-3 w-3" /> Passer au plan supérieur
          </Link>{" "}
          pour le mettre en production.
        </p>
      ) : (
        <p className="mt-1 text-xs text-ink-soft">
          Hébergement, exécutions, logs et validations inclus dans ton plan.
        </p>
      )}
    </div>
  );
}
