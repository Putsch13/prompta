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
    return (
      <div className="rounded-2xl border border-dashed border-line bg-card p-12 text-center">
        <p className="font-display text-lg font-semibold text-ink">Aucun agent pour l&apos;instant</p>
        <p className="mt-2 text-sm text-ink-soft">
          Décris ton objectif en une phrase — le copilote construit l&apos;agent avec toi.
        </p>
        <Link
          href="/dashboard/new"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" /> Créer mon premier agent
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
