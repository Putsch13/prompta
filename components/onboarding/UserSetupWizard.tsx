"use client";

import { useState } from "react";
import { X, Check, ExternalLink, AlertTriangle } from "lucide-react";

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
  {
    id: "serper",
    name: "Serper",
    helpUrl: "https://serper.dev/api-key",
    helpText: "Serper.dev → API Key",
  },
];

type KeySaveState = "idle" | "saving" | "saved" | "invalid";

interface Props {
  onClose: () => void;
  /** Pré-sélection pour rotation (Bloc 4) */
  initialProvider?: string;
  mode?: "setup" | "rotate";
}

export function UserSetupWizard({ onClose, initialProvider, mode = "setup" }: Props) {
  const [step, setStep] = useState(mode === "rotate" && initialProvider ? 2 : 1);
  const [selected, setSelected] = useState<string[]>(
    initialProvider ? [initialProvider] : ["openai"]
  );
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [keyStates, setKeyStates] = useState<Record<string, KeySaveState>>({});
  const [keyErrors, setKeyErrors] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);

  function toggleProvider(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function saveKey(provider: string): Promise<boolean> {
    const apiKey = keys[provider];
    if (!apiKey) return false;

    setKeyStates((prev) => ({ ...prev, [provider]: "saving" }));
    setKeyErrors((prev) => ({ ...prev, [provider]: "" }));

    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        apiKey,
        action: mode === "rotate" ? "rotate" : undefined,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setKeyStates((prev) => ({ ...prev, [provider]: "invalid" }));
      setKeyErrors((prev) => ({
        ...prev,
        [provider]: data.error || "Erreur de sauvegarde",
      }));
      return false;
    }

    setKeyStates((prev) => ({
      ...prev,
      [provider]: data.valid ? "saved" : "invalid",
    }));
    if (!data.valid) {
      setKeyErrors((prev) => ({
        ...prev,
        [provider]: "Clé enregistrée mais non validée par le fournisseur — re-testable",
      }));
    }
    return true;
  }

  async function saveAllKeys() {
    setTesting(true);
    let allOk = true;

    for (const p of selected) {
      if (!keys[p]) {
        allOk = false;
        setKeyErrors((prev) => ({ ...prev, [p]: "Clé requise" }));
        continue;
      }
      if (keyStates[p] === "saved") continue;
      const ok = await saveKey(p);
      if (!ok) allOk = false;
    }

    setTesting(false);
    if (allOk) setStep(3);
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
                className={`h-1 flex-1 rounded-full ${step >= s ? "bg-accent" : "bg-line"}`}
              />
            ))}
          </div>
        </div>

        {step === 1 && (
          <>
            <h2 className="font-display text-xl font-bold text-ink">
              Choisissez vos fournisseurs
            </h2>
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
              {mode === "rotate" ? "Rotation de clé" : "Collez vos clés API"}
            </h2>
            <div className="mt-6 space-y-4">
              {selected.map((id) => {
                const provider = PROVIDERS.find((p) => p.id === id)!;
                const state = keyStates[id] ?? "idle";
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
                    {state === "saved" && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-green-600">
                        <Check className="h-3 w-3" /> Enregistrée
                      </p>
                    )}
                    {state === "invalid" && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                        <AlertTriangle className="h-3 w-3" /> {keyErrors[id]}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex gap-3">
              {mode !== "rotate" && (
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 rounded-lg border border-line py-2.5 text-sm font-medium"
                >
                  Retour
                </button>
              )}
              <button
                onClick={saveAllKeys}
                disabled={testing}
                className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {testing ? "Enregistrement…" : "Valider et continuer"}
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
                Clés enregistrées
              </h2>
            </div>
            <button
              onClick={onClose}
              className="mt-6 w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-white"
            >
              Terminer
            </button>
          </>
        )}
      </div>
    </div>
  );
}
