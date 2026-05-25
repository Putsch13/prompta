"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, RefreshCw, Check, AlertTriangle } from "lucide-react";
import { UserSetupWizard } from "@/components/onboarding/UserSetupWizard";

interface KeyRecord {
  id: string;
  provider: string;
  last4: string;
  is_valid: boolean;
  last_checked_at: string | null;
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google AI",
  mistral: "Mistral",
  serper: "Serper.dev",
};

export default function ConnexionsPage() {
  const [keys, setKeys] = useState<KeyRecord[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  async function loadKeys() {
    const res = await fetch("/api/keys");
    if (res.ok) {
      const data = await res.json();
      setKeys(data.keys ?? []);
    }
  }

  useEffect(() => {
    loadKeys();
  }, []);

  async function handleDelete(provider: string) {
    await fetch(`/api/keys?provider=${provider}`, { method: "DELETE" });
    setDeleteConfirm(null);
    loadKeys();
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">
            Mes connexions
          </h1>
          <p className="mt-2 text-ink-soft">
            Gérez vos clés API pour lancer des prompts et agents.
          </p>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" />
          Ajouter une clé
        </button>
      </div>

      {keys.length === 0 ? (
        <div className="rounded-xl border border-line bg-card p-12 text-center">
          <p className="font-display text-lg font-semibold text-ink">
            Aucune clé configurée
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            Configurez vos clés pour lancer des prompts directement sur Prompta.
          </p>
          <button
            onClick={() => setShowWizard(true)}
            className="mt-6 rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white"
          >
            Configurer mes clés (1 min)
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between rounded-xl border border-line bg-card p-4"
            >
              <div className="flex items-center gap-4">
                <div>
                  <p className="font-medium text-ink">
                    {PROVIDER_LABELS[key.provider] ?? key.provider}
                  </p>
                  <p className="font-mono text-sm text-ink-soft">
                    sk-…{key.last4}
                  </p>
                </div>
                {key.is_valid ? (
                  <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">
                    <Check className="h-3 w-3" /> Valide
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                    <AlertTriangle className="h-3 w-3" /> Invalide
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowWizard(true)}
                  className="rounded-lg border border-line p-2 text-ink-soft hover:bg-card2"
                  title="Rotation"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                {deleteConfirm === key.provider ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink-soft">Confirmer ?</span>
                    <button
                      onClick={() => handleDelete(key.provider)}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white"
                    >
                      Supprimer
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="text-xs text-ink-soft"
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(key.provider)}
                    className="rounded-lg border border-line p-2 text-red-600 hover:bg-red-50"
                    title="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteConfirm && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="mb-1 inline h-4 w-4" /> La suppression de cette clé
          empêchera l&apos;exécution des prompts/agents qui en dépendent. Votre abonnement
          ne sera pas affecté.
        </div>
      )}

      {showWizard && (
        <UserSetupWizard
          onClose={() => {
            setShowWizard(false);
            loadKeys();
          }}
        />
      )}
    </div>
  );
}
