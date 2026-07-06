import Link from "next/link";
import { Check, Circle, Plus, Plug, Rocket } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface Props {
  userId: string;
  /** Conservé pour compat — plus utilisé (parcours sans vente). */
  kycComplete?: boolean;
}

/** Parcours d'activation : connecter → construire → mettre en production. */
export async function BuilderOnboardingChecklist({ userId }: Props) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const [{ count: connectionCount }, { count: agentCount }, { count: runCount }] =
    await Promise.all([
      admin
        .from("user_connections")
        .select("*", { count: "exact", head: true })
        .eq("owner_id", userId)
        .eq("status", "connected"),
      supabase
        .from("listings")
        .select("*", { count: "exact", head: true })
        .eq("creator_id", userId)
        .neq("type", "prompt"),
      admin
        .from("listing_agent_runs")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);

  const steps = [
    {
      id: "connect",
      label: "Connecter une première app (Gmail, Sheets, Canva…)",
      done: (connectionCount ?? 0) > 0,
      href: "/dashboard/connexions",
      icon: Plug,
    },
    {
      id: "build",
      label: "Construire son premier agent avec le copilote",
      done: (agentCount ?? 0) > 0,
      href: "/dashboard/new",
      icon: Plus,
    },
    {
      id: "run",
      label: "Le lancer pour de vrai et suivre le live",
      done: (runCount ?? 0) > 0,
      href: "/dashboard/new",
      icon: Rocket,
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  if (completed === steps.length) return null;

  return (
    <div className="mt-8 rounded-2xl border border-line bg-card p-6">
      <h2 className="font-display text-lg font-semibold text-ink">Bien démarrer</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {completed}/{steps.length} étapes — ton premier agent en production en moins de 10 minutes.
      </p>
      <ul className="mt-4 space-y-3">
        {steps.map((step) => (
          <li key={step.id}>
            <Link href={step.href} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-card2">
              {step.done ? (
                <Check className="h-5 w-5 text-success" />
              ) : (
                <Circle className="h-5 w-5 text-ink-faint" />
              )}
              <step.icon className="h-4 w-4 text-accent" />
              <span className={`text-sm ${step.done ? "text-ink-soft line-through" : "text-ink"}`}>
                {step.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
