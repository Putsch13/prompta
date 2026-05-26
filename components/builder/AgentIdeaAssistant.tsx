"use client";

import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { CatalogSingleSelect } from "@/components/builder/CatalogSingleSelect";
import { getBuilderModels } from "@/lib/catalogs";
import type { GeneratedSkeleton } from "@/lib/builder/generate-skeleton";

interface Props {
  onGenerated: (skeleton: GeneratedSkeleton) => void;
  builderModel?: string;
}

export function AgentIdeaAssistant({ onGenerated, builderModel = "gpt-5.4-mini" }: Props) {
  const [idea, setIdea] = useState("");
  const [modelId, setModelId] = useState(builderModel);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (idea.trim().length < 10) {
      setError("Décrivez votre agent en quelques phrases (min. 10 caractères).");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/builder/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: idea.trim(), modelId }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Erreur");
      return;
    }
    onGenerated(data.skeleton as GeneratedSkeleton);
  }

  return (
    <div className="mt-6 rounded-xl border border-dashed border-accent/40 bg-accent/5 p-4">
      <div className="flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-accent" />
        <p className="text-sm font-medium text-ink">Création assistée par IA</p>
      </div>
      <p className="mt-1 text-xs text-ink-soft">
        Décrivez votre agent en langage naturel — Prompta génère étapes, variables et connecteurs
        suggérés.
      </p>
      <div className="mt-3">
        <p className="mb-1 text-xs font-medium text-ink-soft">Modèle IA</p>
        <CatalogSingleSelect
          catalog={getBuilderModels() as { id: string; label: string; provider?: string }[]}
          value={modelId}
          onChange={setModelId}
          groupByKey="provider"
          placeholder="OpenAI, Anthropic, Google…"
        />
      </div>
      <textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="Ex. Un agent qui lit un email client mécontent et propose une réponse empathique avec étapes de résolution…"
        rows={3}
        className="mt-3 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm"
      />
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        className="mt-3 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
        {loading ? "Génération…" : "Générer le squelette"}
      </button>
    </div>
  );
}
