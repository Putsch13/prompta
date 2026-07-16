import Link from "next/link";
import { Check, Circle, Key, Play, Compass } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

interface Props {
  userId: string;
}

export async function OnboardingChecklist({ userId }: Props) {
  const supabase = await createClient();

  const [{ count: keyCount }, { count: runCount }, { count: agentCount }] =
    await Promise.all([
      supabase
        .from("user_api_keys")
        .select("*", { count: "exact", head: true })
        .eq("owner_id", userId),
      supabase
        .from("runs")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "completed"),
      supabase
        .from("listings")
        .select("*", { count: "exact", head: true })
        .eq("creator_id", userId),
    ]);

  const steps = [
    {
      id: "keys",
      label: "Configurez une clé API",
      done: (keyCount ?? 0) > 0,
      href: "/dashboard/connexions",
      icon: Key,
    },
    {
      id: "run",
      label: "Donnez votre premier ordre à l'assistant",
      done: (runCount ?? 0) > 0,
      href: "/quick",
      icon: Play,
    },
    {
      id: "create",
      label: "Créez votre premier agent",
      done: (agentCount ?? 0) > 0,
      href: "/dashboard/new",
      icon: Compass,
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const progress = Math.round((completed / steps.length) * 100);

  if (completed === steps.length) return null;

  return (
    <div className="mt-8 rounded-xl border border-line bg-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Premiers pas
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {completed}/{steps.length} étapes · {progress}%
          </p>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-card2">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ul className="mt-5 space-y-3">
        {steps.map((step) => (
          <li key={step.id}>
            <Link
              href={step.href}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-card2"
            >
              {step.done ? (
                <Check className="h-5 w-5 shrink-0 text-success" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-ink-faint" />
              )}
              <step.icon className="h-4 w-4 shrink-0 text-accent" />
              <span
                className={`text-sm ${step.done ? "text-ink-soft line-through" : "text-ink"}`}
              >
                {step.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
