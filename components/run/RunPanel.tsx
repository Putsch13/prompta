"use client";

import { useState, useEffect, useCallback } from "react";
import { Copy, Play, Check, AlertTriangle, Settings, Coins } from "lucide-react";
import { UserSetupWizard } from "@/components/onboarding/UserSetupWizard";
import { estimateCost } from "@/lib/llm/providers";
import { RUN_CREDIT_COST_CENTS } from "@/lib/credit-packs";

interface EnvField {
  key: string;
  description: string;
  required: boolean;
}

interface Props {
  listingId: string;
  versionId: string | null;
  listingSlug: string;
  title: string;
  promptBody: string | null;
  models: string[];
  envFields?: EnvField[];
  requiredSecrets?: string[];
  pricingMode?: string;
  subscriptionPriceCents?: number;
  hasSubscription?: boolean;
  priceCents: number;
  isFree: boolean;
  canAccess: boolean;
  type: "prompt" | "agent" | "workflow";
}

interface KeyStatus {
  provider: string;
  last4: string;
  is_valid: boolean;
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google AI",
  mistral: "Mistral",
  serper: "Serper.dev",
};

function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{(\w+)\}\}/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, ""))));
}

export function RunPanel({
  listingId,
  versionId,
  promptBody,
  models,
  envFields = [],
  requiredSecrets = [],
  pricingMode,
  subscriptionPriceCents = 0,
  priceCents,
  isFree,
  canAccess,
  type,
}: Props) {
  const [tab, setTab] = useState<"copy" | "run">("copy");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [copyMode, setCopyMode] = useState<"template" | "filled">("filled");
  const [copied, setCopied] = useState(false);
  const [selectedModel, setSelectedModel] = useState(models[0] ?? "gpt-4o");
  const [keys, setKeys] = useState<KeyStatus[]>([]);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  const [agentOutput, setAgentOutput] = useState("");
  const [agentStatus, setAgentStatus] = useState<string | null>(null);

  const varNames = promptBody
    ? extractVariables(promptBody)
    : envFields.map((f) => f.key);

  const estimatedCostUsd = estimateCost(selectedModel, 500, 1500);
  const creditCostEur = (RUN_CREDIT_COST_CENTS / 100).toFixed(2);

  const loadKeys = useCallback(async () => {
    const res = await fetch("/api/keys");
    if (res.ok) {
      const data = await res.json();
      setKeys(data.keys ?? []);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  function interpolate(text: string): string {
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? "");
  }

  function getPromptText(): string {
    if (!promptBody) return "";
    return copyMode === "filled" ? interpolate(promptBody) : promptBody;
  }

  async function handleCopy() {
    const text = getPromptText();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function getRequiredProvider(): string {
    if (selectedModel.startsWith("claude")) return "anthropic";
    if (selectedModel.startsWith("gemini")) return "google";
    if (selectedModel.startsWith("mistral")) return "mistral";
    return "openai";
  }

  function hasRequiredKey(): boolean {
    const provider = getRequiredProvider();
    return keys.some((k) => k.provider === provider && k.is_valid);
  }

  function hasAllSecrets(): boolean {
    const needed = requiredSecrets.length > 0 ? requiredSecrets : [getRequiredProvider()];
    return needed.every((p) => keys.some((k) => k.provider === p && k.is_valid));
  }

  async function handleAgentRun() {
    if (!versionId) return;
    if (!hasAllSecrets()) {
      setShowWizard(true);
      return;
    }

    setRunning(true);
    setAgentOutput("");
    setAgentStatus(null);
    setError(null);

    try {
      const res = await fetch("/api/run/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          versionId,
          inputs: variables,
          async: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message);
      setAgentStatus(data.status);
      setAgentOutput(data.output?.result ?? JSON.stringify(data.output, null, 2));
      if (data.error) setError(data.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur agent");
    } finally {
      setRunning(false);
    }
  }

  async function handleRun() {
    if (!versionId) return;

    if (!hasRequiredKey() && !isFree) {
      setShowWizard(true);
      return;
    }

    setRunning(true);
    setOutput("");
    setError(null);

    try {
      const res = await fetch("/api/run/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          versionId,
          model: selectedModel,
          variables,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.error === "configure_keys") {
          setShowWizard(true);
          return;
        }
        throw new Error(data.message ?? data.error);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("Stream indisponible");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          const data = JSON.parse(line.slice(6));
          if (data.type === "chunk") {
            setOutput((prev) => prev + data.content);
          } else if (data.type === "error") {
            setError(data.message);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur d'exécution");
    } finally {
      setRunning(false);
    }
  }

  if (!canAccess && !isFree) {
    return (
      <div className="rounded-xl border border-line bg-card p-6 text-center">
        <p className="font-display text-lg font-semibold text-ink">
          Acheter — {(priceCents / 100).toFixed(2)} €
        </p>
        <p className="mt-2 text-sm text-ink-soft">
          Débloquez la copie et l&apos;exécution de ce {type}.
        </p>
      </div>
    );
  }

  if (type !== "prompt" || !promptBody) {
    const secrets =
      requiredSecrets.length > 0 ? requiredSecrets : [getRequiredProvider()];

    return (
      <>
        <div className="rounded-xl border border-line bg-card p-6">
          <h3 className="font-display text-lg font-semibold text-ink">
            Lancer cet {type}
          </h3>
          {pricingMode === "subscription" && !canAccess && !isFree && (
            <p className="mt-2 text-sm text-ink-soft">
              Abonnement recommandé — {(subscriptionPriceCents / 100).toFixed(2)} €/mois + vos clés API.
            </p>
          )}

          {varNames.length > 0 && (
            <div className="mt-4 space-y-2">
              {varNames.map((v) => (
                <div key={v}>
                  <label className="text-xs text-ink-soft">{v}</label>
                  <input
                    value={variables[v] ?? ""}
                    onChange={(e) =>
                      setVariables((prev) => ({ ...prev, [v]: e.target.value }))
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-line px-3 text-sm"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="mt-4">
            <p className="mb-2 text-[11px] font-bold uppercase text-ink-soft">
              Connexions requises
            </p>
            {secrets.map((p) => {
              const key = keys.find((k) => k.provider === p);
              return (
                <div key={p} className="mb-1 flex justify-between rounded-lg bg-card2 px-3 py-2 text-sm">
                  <span>{PROVIDER_LABELS[p] ?? p}</span>
                  {key?.is_valid ? (
                    <span className="text-green-600">✓ …{key.last4}</span>
                  ) : (
                    <button onClick={() => setShowWizard(true)} className="text-amber-600">
                      Configurer
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={handleAgentRun}
            disabled={running || (!canAccess && !isFree)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            {running ? "Exécution…" : "Lancer l'agent"}
          </button>

          {!canAccess && !isFree && (
            <p className="mt-2 text-center text-xs text-ink-soft">
              Abonnez-vous ou achetez pour lancer cet agent.
            </p>
          )}

          {canAccess && !hasAllSecrets() && (
            <p className="mt-2 flex items-center justify-center gap-1 text-xs text-ink-soft">
              <Coins className="h-3 w-3" /> Mode BYOK — configurez vos clés
            </p>
          )}

          {agentStatus && (
            <p className="mt-2 text-sm">
              Statut :{" "}
              <span className={agentStatus === "completed" ? "text-green-600" : "text-red-600"}>
                {agentStatus}
              </span>
            </p>
          )}
          {agentOutput && (
            <pre className="mt-3 max-h-60 overflow-auto rounded-lg bg-card2 p-3 text-xs whitespace-pre-wrap">
              {agentOutput}
            </pre>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
        {showWizard && (
          <UserSetupWizard onClose={() => { setShowWizard(false); loadKeys(); }} />
        )}
      </>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-line bg-card">
        <div className="border-b border-line p-4">
          <h3 className="font-display text-lg font-semibold text-ink">
            Utiliser ce prompt
          </h3>
          <div className="mt-3 flex gap-2 sm:hidden">
            <button
              onClick={() => setTab("copy")}
              className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                tab === "copy" ? "bg-accent text-white" : "bg-card2 text-ink-soft"
              }`}
            >
              Copier
            </button>
            <button
              onClick={() => setTab("run")}
              className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                tab === "run" ? "bg-accent text-white" : "bg-card2 text-ink-soft"
              }`}
            >
              Lancer ici
            </button>
          </div>
          <div className="mt-3 hidden gap-4 sm:flex">
            <button
              onClick={() => setTab("copy")}
              className={`border-b-2 px-1 pb-2 text-sm font-medium ${
                tab === "copy"
                  ? "border-accent text-accent"
                  : "border-transparent text-ink-soft"
              }`}
            >
              Copier
            </button>
            <button
              onClick={() => setTab("run")}
              className={`border-b-2 px-1 pb-2 text-sm font-medium ${
                tab === "run"
                  ? "border-accent text-accent"
                  : "border-transparent text-ink-soft"
              }`}
            >
              Lancer ici
            </button>
          </div>
        </div>

        <div className="p-4">
          {varNames.length > 0 && (
            <div className="mb-4 space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                Variables
              </p>
              {varNames.map((v) => (
                <div key={v}>
                  <label className="mb-1 block text-xs text-ink-soft">{v}</label>
                  <input
                    value={variables[v] ?? ""}
                    onChange={(e) =>
                      setVariables((prev) => ({ ...prev, [v]: e.target.value }))
                    }
                    className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-ink"
                    placeholder={`{{${v}}}`}
                  />
                </div>
              ))}
            </div>
          )}

          {(tab === "copy" || typeof window === "undefined") && (
            <div className={tab === "run" ? "hidden sm:hidden" : ""}>
              <div className="mb-4 flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={copyMode === "template"}
                    onChange={() => setCopyMode("template")}
                  />
                  Copier le modèle
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={copyMode === "filled"}
                    onChange={() => setCopyMode("filled")}
                  />
                  Copier rempli
                </label>
              </div>
              <button
                onClick={handleCopy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-medium text-white hover:bg-accent/90"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" /> Copié ✓
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" /> Copier le prompt
                  </>
                )}
              </button>
              <p className="mt-2 text-center text-xs text-ink-faint">
                Collez-le dans ChatGPT, Claude, Gemini…
              </p>
            </div>
          )}

          {(tab === "run" || typeof window === "undefined") && (
            <div className={tab === "copy" ? "hidden sm:hidden" : ""}>
              {models.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                    Modèle
                  </p>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm"
                  >
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mb-4">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                  Connexions requises
                </p>
                <div className="space-y-2">
                  {[getRequiredProvider()].map((p) => {
                    const key = keys.find((k) => k.provider === p);
                    return (
                      <div
                        key={p}
                        className="flex items-center justify-between rounded-lg bg-card2 px-3 py-2 text-sm"
                      >
                        <span>{PROVIDER_LABELS[p] ?? p}</span>
                        {key?.is_valid ? (
                          <span className="flex items-center gap-1 text-green-600">
                            <Check className="h-3.5 w-3.5" /> …{key.last4}
                          </span>
                        ) : (
                          <button
                            onClick={() => setShowWizard(true)}
                            className="flex items-center gap-1 text-amber-600"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" /> Configurer
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <p className="mb-3 text-xs text-ink-faint">
                Estimation ~{estimatedCostUsd.toFixed(4)} $ (500+1500 tokens) · ou {creditCostEur} €/run en crédits
              </p>

              <button
                onClick={handleRun}
                disabled={running}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                {running ? "Exécution simulée…" : "Lancer l'exécution"}
              </button>

              {!hasRequiredKey() && (
                <button
                  onClick={() => setShowWizard(true)}
                  className="mt-2 flex w-full items-center justify-center gap-1 text-xs text-accent hover:underline"
                >
                  <Settings className="h-3 w-3" />
                  Pas encore de clés ? Configurer (1 min)
                </button>
              )}

              {output && (
                <div className="mt-4 rounded-lg border border-line bg-card2 p-4 font-mono text-sm whitespace-pre-wrap">
                  {output}
                </div>
              )}

              {error && (
                <p className="mt-3 text-sm text-red-600">{error}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {showWizard && (
        <UserSetupWizard
          onClose={() => {
            setShowWizard(false);
            loadKeys();
          }}
        />
      )}
    </>
  );
}
