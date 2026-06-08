"use client";

import { Sparkles, X } from "lucide-react";
import type { ReactNode } from "react";
import { CatalogSingleSelect } from "@/components/builder/CatalogSingleSelect";

interface ModelOption {
  id: string;
  label: string;
  provider?: string;
}

interface Props {
  label: string;
  required?: boolean;
  active: boolean;
  model: string;
  prompt: string;
  models: ModelOption[];
  envFields?: { key: string; label: string }[];
  priorOutputs?: string[];
  onToggle: (active: boolean) => void;
  onChange: (model: string, prompt: string) => void;
  /** Widget standard affiché quand le remplissage IA est désactivé. */
  children: ReactNode;
}

/**
 * Enveloppe un champ libre : permet de basculer entre saisie standard et
 * « remplissage par IA » (modèle au choix + consigne). La valeur est générée au
 * run par le modèle ; le champ n'est alors plus demandé à l'abonné.
 */
export function AiFillField({
  label,
  required,
  active,
  model,
  prompt,
  models,
  envFields = [],
  priorOutputs = [],
  onToggle,
  onChange,
  children,
}: Props) {
  if (!active) {
    return (
      <div className="relative">
        {children}
        <button
          type="button"
          onClick={() => onToggle(true)}
          className="mt-1 inline-flex items-center gap-1 rounded bg-card2 px-1.5 py-0.5 text-[10px] text-ink-soft hover:bg-accent/10 hover:text-accent"
          title="Laisser une IA générer ce champ"
        >
          <Sparkles className="h-3 w-3" /> Remplir par IA
        </button>
      </div>
    );
  }

  const insertToken = (token: string) => {
    onChange(model, `${prompt}${prompt && !prompt.endsWith(" ") ? " " : ""}{{${token}}}`);
  };

  return (
    <div className="rounded-lg border border-accent/40 bg-accent/5 p-2">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent">
          <Sparkles className="h-3 w-3" /> {label}
          {required ? " *" : ""} — généré par IA
        </span>
        <button
          type="button"
          onClick={() => onToggle(false)}
          className="text-ink-faint hover:text-ink"
          title="Revenir à la saisie manuelle"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-2">
        <label className="text-[10px] text-ink-faint">Modèle</label>
        <CatalogSingleSelect
          catalog={models as { id: string; label: string; [k: string]: unknown }[]}
          value={model}
          onChange={(id) => onChange(id, prompt)}
          groupByKey="provider"
          placeholder="Modèle IA"
        />
      </div>
      <div className="mt-2">
        <label className="text-[10px] text-ink-faint">
          Consigne — décrivez ce que l&apos;IA doit produire pour ce champ
        </label>
        {(envFields.length > 0 || priorOutputs.length > 0) && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {envFields.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => insertToken(f.key)}
                className="rounded bg-card2 px-1.5 py-0.5 text-[10px] text-ink-soft hover:bg-accent/10"
              >
                + {f.key}
              </button>
            ))}
            {priorOutputs.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => insertToken(k)}
                className="rounded bg-card2 px-1.5 py-0.5 text-[10px] text-ink-soft hover:bg-accent/10"
              >
                + {k}
              </button>
            ))}
          </div>
        )}
        <textarea
          value={prompt}
          onChange={(e) => onChange(model, e.target.value)}
          rows={3}
          placeholder="Ex. : rédige un objet d'email accrocheur à partir de {{sujet}}"
          className="mt-1 w-full rounded border border-line px-2 py-1 text-xs"
        />
      </div>
    </div>
  );
}
