"use client";

import { Sparkles } from "lucide-react";
import { AGENT_TEMPLATES, type AgentTemplate } from "@/lib/templates/agent-templates";

interface Props {
  onSelect: (template: AgentTemplate) => void;
  selectedId?: string;
}

export function TemplatePicker({ onSelect, selectedId }: Props) {
  return (
    <div className="mt-6">
      <p className="text-sm font-medium text-ink">Templates de départ</p>
      <p className="mt-1 text-xs text-ink-soft">
        Cas d&apos;usage prêts à personnaliser — idéal pour publier en moins de 15 minutes.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {AGENT_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t)}
            className={`rounded-xl border p-4 text-left transition-colors ${
              selectedId === t.id ? "border-accent bg-accent-light" : "border-line hover:border-accent/50"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-ink">{t.label}</p>
              {t.id === "email-pro" && (
                <Sparkles className="h-4 w-4 shrink-0 text-accent" aria-label="Démo signature" />
              )}
            </div>
            <p className="mt-1 text-xs text-accent">{t.segment}</p>
            <p className="mt-2 line-clamp-2 text-xs text-ink-soft">{t.description}</p>
            <p className="mt-2 text-[10px] text-ink-faint">
              {t.steps.length} étape(s) · {t.setupTime}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
