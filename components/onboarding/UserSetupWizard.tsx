"use client";

import { useState } from "react";
import { X, Check, ExternalLink } from "lucide-react";

const PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    helpUrl: "https://platform.openai.com/api-keys",
    helpText: "Créez une clé sur platform.openai.com → API keys",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    helpUrl: "https://console.anthropic.com/settings/keys",
    helpText: "Console Anthropic → Settings → API Keys",
  },
  {
    id: "google",
    name: "Google AI",
    helpUrl: "https://aistudio.google.com/app/apikey",
    helpText: "Google AI Studio → Get API key",
  },
  {
    id: "mistral",
    name: "Mistral",
    helpUrl: "https://console.mistral.ai/api-keys/",
    helpText: "Console Mistral → API Keys",
  },
];

interface Props {
  onClose: () => void;
}

export function UserSetupWizard({ onClose }: Props) {
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState<string[]>(["openai"]);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function toggleProvider(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function saveKey(provider: string) {
    const apiKey = keys[provider];
    if (!apiKey) return;

    setTesting(provider);
    setError(null);

    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey, action: "test" }),
    });

    const data = await res.json();

    if (!data.valid) {
      setError(`Clé ${provider} invalide`);
      setTesting(null);
      return;
    }

    const saveRes = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey }),
    });

    if (saveRes.ok) {
      setSaved((prev) => [...prev, provider]);
    }

    setTesting(null);
  }

  async function saveAllKeys() {
    for (const p of selected) {
      if (keys[p] && !saved.includes(p)) {
        await saveKey(p);
      }
    }
    setStep(3);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-lg rounded-xl border border-line bg-card p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-ink-faint hover:text-ink"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6">
          <div className="flex gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full ${
                  step >= s ? "bg-accent" : "bg-line"
                }`}
              />
            ))}
          </div>
        </div>

        {step === 1 && (
          <>
            <h2 className="font-display text-xl font-bold text-ink">
              Choisissez vos fournisseurs
            </h2>
            <p className="mt-2 text-sm text-ink-soft">
              Sélectionnez les services IA que vous utilisez.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => toggleProvider(p.id)}
                  className={`rounded-lg border p-4 text-left transition-all ${
                    selected.includes(p.id)
                      ? "border-accent bg-accent-light"
                      : "border-line hover:border-accent/50"
                  }`}
                >
                  <span className="font-medium text-ink">{p.name}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setStep(2)}
              disabled={selected.length === 0}
              className="mt-6 w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Continuer
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="font-display text-xl font-bold text-ink">
              Collez vos clés API
            </h2>
            <p className="mt-2 text-sm text-ink-soft">
              Vos clés sont chiffrées et ne quittent jamais le serveur.
            </p>
            <div className="mt-6 space-y-4">
              {selected.map((id) => {
                const provider = PROVIDERS.find((p) => p.id === id)!;
                return (
                  <div key={id}>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-[11px] font-bold uppercase text-ink-soft">
                        {provider.name}
                      </label>
                      <a
                        href={provider.helpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-accent hover:underline"
                      >
                        Où trouver ma clé ? <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <input
                      type="password"
                      value={keys[id] ?? ""}
                      onChange={(e) =>
                        setKeys((prev) => ({ ...prev, [id]: e.target.value }))
                      }
                      placeholder="sk-…"
                      className="h-10 w-full rounded-lg border border-line bg-card px-3 font-mono text-sm"
                    />
                    {saved.includes(id) && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-green-600">
                        <Check className="h-3 w-3" /> Clé validée
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 rounded-lg border border-line py-2.5 text-sm font-medium"
              >
                Retour
              </button>
              <button
                onClick={saveAllKeys}
                disabled={!!testing}
                className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {testing ? "Test en cours…" : "Valider et continuer"}
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent-light">
                <Check className="h-8 w-8 text-accent" />
              </div>
              <h2 className="mt-4 font-display text-xl font-bold text-ink">
                Vous êtes prêt !
              </h2>
              <p className="mt-2 text-sm text-ink-soft">
                Lancez des prompts et agents directement sur Prompta.
              </p>
            </div>
            <button
              onClick={onClose}
              className="mt-6 w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-white"
            >
              Commencer
            </button>
          </>
        )}
      </div>
    </div>
  );
}
