"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AgentLifecycleCard } from "@/components/dashboard/AgentLifecycleCard";
import type { AgentOverview } from "@/lib/library/agent-overview";

export function AgentsGrid({ agents }: { agents: AgentOverview[] }) {
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const visible = agents.filter((a) => !deletedIds.has(a.id));

  if (visible.length === 0) {
    const SUGGESTIONS = [
      {
        label: "📰 Veille quotidienne par email",
        objectif:
          "Chaque matin, cherche les 3 actualités les plus importantes de mon secteur et envoie-moi un résumé clair par email.",
      },
      {
        label: "📊 Rapport hebdo dans Sheets",
        objectif:
          "Chaque lundi, analyse mes fichiers Drive récents, fais une synthèse des avancées et écris les points clés dans une feuille Google Sheets.",
      },
      {
        label: "🎨 Brief créa + design Canva",
        objectif:
          "À partir d'un sujet que je te donne, rédige un brief créatif puis crée une présentation Canva et envoie-moi le lien.",
      },
    ];
    return (
      <div className="rounded-2xl border border-dashed border-line bg-card p-12 text-center">
        <p className="font-display text-lg font-semibold text-ink">
          Crée ton premier agent en 3 minutes
        </p>
        <p className="mt-2 text-sm text-ink-soft">
          Décris ton objectif en une phrase — le copilote construit l&apos;agent avec toi.
          Pars d&apos;un exemple :
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <Link
              key={s.label}
              href={`/dashboard/new?objectif=${encodeURIComponent(s.objectif)}`}
              className="rounded-full border border-line bg-bg px-4 py-2 text-sm text-ink-soft transition-colors hover:border-accent hover:text-accent"
            >
              {s.label}
            </Link>
          ))}
        </div>
        <Link
          href="/dashboard/new"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-accent-ink shadow-glow-sm hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" /> Ou partir d&apos;une page blanche
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {visible.map((agent) => (
        <AgentLifecycleCard
          key={agent.id}
          agent={agent}
          onDeleted={(id) => setDeletedIds((s) => new Set(s).add(id))}
        />
      ))}
    </div>
  );
}
