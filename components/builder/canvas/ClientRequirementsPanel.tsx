"use client";

import type { ClientRequirementsSummary } from "@/lib/builder/client-requirements";

interface Props {
  summary: ClientRequirementsSummary;
  onPreviewAsClient?: () => void;
}

function Section({
  title,
  items,
  empty,
}: {
  title: string;
  items: { id: string; label: string; nodeName?: string; detail?: string }[];
  empty: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-ink-soft">{title}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-[10px] text-ink-faint">{empty}</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {items.map((item) => (
            <li key={item.id} className="rounded border border-line bg-card px-2 py-1 text-[10px]">
              <span className="font-medium text-ink">{item.label}</span>
              {item.nodeName && (
                <span className="text-ink-faint"> — {item.nodeName}</span>
              )}
              {item.detail && (
                <p className="mt-0.5 text-ink-faint">{item.detail}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ClientRequirementsPanel({ summary, onPreviewAsClient }: Props) {
  return (
    <div className="space-y-4 rounded-xl border border-line bg-card2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">Ce que le client devra fournir</p>
          <p className="mt-0.5 text-[10px] text-ink-soft">
            Dérivé automatiquement de vos nœuds — rien à saisir en double.
          </p>
        </div>
        {onPreviewAsClient && (
          <button
            type="button"
            onClick={onPreviewAsClient}
            className="rounded-lg border border-accent px-2 py-1 text-[10px] font-medium text-accent hover:bg-accent/5"
          >
            Voir comme un client
          </button>
        )}
      </div>

      <Section
        title="Connexions à brancher"
        items={summary.clientConnectors}
        empty="Aucune — ou tout est partagé par vous."
      />
      <Section
        title="Ressources à choisir"
        items={summary.clientResources}
        empty="Aucune ressource laissée au client."
      />
      <Section
        title="Variables à saisir"
        items={summary.clientVariables}
        empty="Aucune variable d'entrée."
      />

      {summary.sharedProvided.length > 0 && (
        <div className="border-t border-line pt-3">
          <p className="text-xs font-semibold text-violet-700">Fourni par vous (partagé 🌐)</p>
          <ul className="mt-1 space-y-1">
            {summary.sharedProvided.map((item) => (
              <li
                key={item.id}
                className="rounded border border-violet-200 bg-violet-50/50 px-2 py-1 text-[10px] text-violet-900"
              >
                {item.label}
                {item.nodeName && ` — ${item.nodeName}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
