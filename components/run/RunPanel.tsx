"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Copy, Play, Check, AlertTriangle, Settings } from "lucide-react";
import { UserSetupWizard } from "@/components/onboarding/UserSetupWizard";
import { ConnectionsMasque } from "@/components/run/ConnectionsMasque";
import type { ApprovalDetails } from "@/components/run/HumanApprovalModal";
import { AgentRunExperience } from "@/components/run/AgentRunExperience";
import { RunResourceFields } from "@/components/run/RunResourceFields";
import type { RunResourceField } from "@/lib/connectors/extract-run-resources";
import { estimateMaxCost } from "@/lib/billing/run-cost";
import { costToCredits, creditsToEur } from "@/lib/billing/credits";

import { extractInputVariables } from "@/lib/builder/variables";
import { EnvFieldInputs } from "@/components/builder/EnvFieldInputs";
import type { StepTraceEntry } from "@/lib/agent/orchestrator";

interface EnvField {
  key: string;
  label?: string;
  description: string;
  help?: string;
  type?: "text" | "textarea" | "number" | "file" | "list";
  required: boolean;
  connectorId?: string;
  paramKey?: string;
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
  requiredConnectors?: string[];
  resourceFields?: RunResourceField[];
  provisioningMode?: "manual" | "assisted" | "managed";
  stepCount?: number;
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

export function RunPanel({
  listingId,
  versionId,
  title,
  promptBody,
  models,
  envFields = [],
  requiredSecrets = [],
  requiredConnectors = [],
  resourceFields = [],
  provisioningMode = "manual",
  stepCount = 3,
  pricingMode,
  subscriptionPriceCents = 0,
  priceCents,
  isFree,
  canAccess,
  type,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"copy" | "run">("copy");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [resourceValues, setResourceValues] = useState<Record<string, string>>({});
  const [copyMode, setCopyMode] = useState<"template" | "filled">("filled");
  const [copied, setCopied] = useState(false);
  const [selectedModel, setSelectedModel] = useState(models[0] ?? "gpt-5.4");
  const [keys, setKeys] = useState<KeyStatus[]>([]);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  const [agentOutput, setAgentOutput] = useState("");
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [stepsCompleted, setStepsCompleted] = useState<number | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState(false);
  const [stepTrace, setStepTrace] = useState<StepTraceEntry[]>([]);
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const [approvalDetails, setApprovalDetails] = useState<ApprovalDetails | null>(null);
  const [showImmersive, setShowImmersive] = useState(false);

  const varNames =
    type === "prompt" && promptBody ? extractInputVariables(promptBody) : [];

  const [connectionsReady, setConnectionsReady] = useState(true);

  const estimatedMax = estimateMaxCost({
    stepCount: type === "prompt" ? 1 : 3,
    maxTokens: 4000,
    maxToolCalls: 2,
  });
  const estimatedCredits = costToCredits(estimatedMax);
  const estimatedEur = creditsToEur(estimatedCredits).toFixed(2);

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
    if (selectedModel.includes("claude")) return "anthropic";
    if (selectedModel.includes("gemini")) return "google";
    if (selectedModel.includes("mistral")) return "mistral";
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

  async function pollRunStatus(id: string) {
    const maxPolls = 120;
    let polls = 0;

    async function tick() {
      try {
        const [runRes, stepsRes] = await Promise.all([
          fetch(`/api/run/agent/${id}`),
          fetch(`/api/run/agent/${id}/steps`),
        ]);
        if (stepsRes.ok) {
          const stepsData = await stepsRes.json();
          const mapped: StepTraceEntry[] = (stepsData.steps ?? []).map(
            (s: {
              stepIndex: number;
              stepType: string;
              label?: string;
              status: string;
              outputPreview?: string | Record<string, unknown>;
              durationMs?: number;
              model?: string;
              actionSlug?: string;
            }) => ({
              stepIndex: s.stepIndex,
              stepType: s.stepType,
              label: s.label ?? `Étape ${s.stepIndex + 1}`,
              status: s.status as StepTraceEntry["status"],
              outputPreview:
                typeof s.outputPreview === "string"
                  ? s.outputPreview
                  : s.outputPreview
                    ? JSON.stringify(s.outputPreview).slice(0, 800)
                    : undefined,
              durationMs: s.durationMs,
              model: s.model,
              actionSlug: s.actionSlug,
            })
          );
          if (mapped.length > 0) setStepTrace(mapped);
        }
        if (runRes.ok) {
          const data = await runRes.json();
          const status = data.status === "pending" ? "queued" : data.status;
          setAgentStatus(status);
          if (data.steps_completed != null) setStepsCompleted(data.steps_completed);
          if (data.status === "awaiting_approval" && data.approval_id) {
            setApprovalId(data.approval_id);
            if (data.approval) {
              setApprovalDetails({
                id: data.approval.id,
                label: data.approval.label,
                preview: data.approval.preview,
                stepIndex: data.approval.step_index,
              });
            }
            setRunning(false);
            return true;
          }
          if (data.status === "completed") {
            setAgentOutput(data.output?.result ?? JSON.stringify(data.output, null, 2));
            setRunning(false);
            return true;
          }
          if (data.status === "failed" || data.status === "suspended") {
            setError(data.error_message || "L'agent a échoué");
            setRunning(false);
            return true;
          }
        }
      } catch {
        // ignore poll errors, continue
      }
      return false;
    }

    if (await tick()) return;

    while (polls < maxPolls) {
      await new Promise((r) => setTimeout(r, 800));
      polls++;
      if (await tick()) return;
    }
    setError("Délai d'attente dépassé — l'agent peut continuer en arrière-plan");
    setAgentStatus("failed");
    setRunning(false);
  }

  async function handleApprove(approvalIdParam: string, modifiedContent?: string) {
    if (!runId) return;
    const res = await fetch(`/api/run/agent/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        approvalId: approvalIdParam,
        decision: "approved",
        modifiedContent,
      }),
    });
    if (!res.ok) {
      setError("Approbation échouée");
      return;
    }
    setApprovalId(null);
    setApprovalDetails(null);
    setRunning(true);
    setAgentStatus("running");
    await pollRunStatus(runId);
  }

  async function handleReject(approvalIdParam: string) {
    if (!runId) return;
    const res = await fetch(`/api/run/agent/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId: approvalIdParam, decision: "rejected" }),
    });
    if (!res.ok) {
      setError("Refus échoué");
      return;
    }
    setApprovalId(null);
    setApprovalDetails(null);
    setRunning(false);
    setAgentStatus("failed");
    setError("Action rejetée — le run est arrêté.");
  }

  const [runMode, setRunMode] = useState<string | null>(null);

  async function handleAgentRun(runDryRun: boolean = dryRun) {
    if (!versionId) return;

    if (!runDryRun) {
      for (const field of resourceFields) {
        if (!resourceValues[field.id]) {
          setError(`Choisissez : ${field.label}`);
          return;
        }
      }
    }

    setError(null);
    setRunning(true);
    setAgentOutput("");
    setAgentStatus("checking");
    setStepsCompleted(null);
    setRunId(null);
    setStepTrace([]);
    setApprovalId(null);
    setShowImmersive(true);
    setDryRun(runDryRun);

    // Preflight: check if user can run
    try {
      const pfRes = await fetch("/api/run/agent/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, versionId }),
      });
      if (pfRes.ok) {
        const pf = await pfRes.json();
        setRunMode(pf.mode);
        if (!pf.canRun) {
          if (pf.missingConnectors?.length > 0) {
            setConnectionsReady(false);
            setError(pf.reason ?? "Connexion manquante");
            setRunning(false);
            return;
          }
          if (pf.missingKeys?.length > 0 && pf.creditBalance <= 0) {
            setShowWizard(true);
            setRunning(false);
            return;
          }
          setError(pf.reason ?? "Impossible de lancer l'agent");
          setRunning(false);
          return;
        }
      }
    } catch {
      // Preflight failed — let the run endpoint handle it
    }

    setAgentStatus("pending");

    try {
      const res = await fetch("/api/run/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          versionId,
          inputs: { ...variables, ...resourceValues },
          dryRun: runDryRun,
          async: !runDryRun,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "configuration_incomplete") {
          const connectorIssue = (data.issues as { code?: string }[] | undefined)?.some(
            (i) => i.code === "missing_connector"
          );
          if (!connectorIssue) {
            setShowWizard(true);
          }
        }
        throw new Error(
          data.message ??
            (Array.isArray(data.issues)
              ? data.issues.map((i: { message?: string }) => i.message).join(" · ")
              : data.error)
        );
      }

      if (data.runId) setRunId(data.runId);
      if (data.stepsCompleted != null) setStepsCompleted(data.stepsCompleted);
      if (data.stepTrace) setStepTrace(data.stepTrace);
      if (data.approvalId) setApprovalId(data.approvalId);

      if (data.status === "completed" || data.status === "failed" || data.status === "suspended") {
        setAgentStatus(data.status);
        setAgentOutput(data.output?.result ?? JSON.stringify(data.output, null, 2));
        if (data.error) setError(data.error);
        setRunning(false);
      } else if (data.status === "awaiting_approval") {
        setAgentStatus("awaiting_approval");
        setRunning(false);
      } else if (data.runId) {
        setAgentStatus(data.status === "queued" ? "queued" : "running");
        setStepsCompleted(data.steps_completed ?? 0);
        if (!runDryRun) {
          router.push(`/dashboard/runs?id=${data.runId}`);
          return;
        }
        void pollRunStatus(data.runId);
      } else {
        setAgentStatus(data.status);
        setAgentOutput(data.output?.result ?? JSON.stringify(data.output, null, 2));
        setRunning(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur agent");
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
    const isSubscription = pricingMode === "subscription";
    const isCredits = pricingMode === "credits";

    return (
      <div className="rounded-xl border border-line bg-card p-6">
        <h3 className="text-center font-display text-lg font-semibold text-ink">
          {isSubscription ? "Abonnez-vous" : isCredits ? "Achetez des crédits" : "Achetez l'accès"}
        </h3>

        {isSubscription && (
          <>
            <p className="mt-3 text-center text-2xl font-bold text-ink">
              {(subscriptionPriceCents / 100).toFixed(2)} €<span className="text-sm font-normal text-ink-soft">/mois</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm text-ink-soft">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" /> Exécutions illimitées
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" /> Vos propres clés API (BYOK)
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" /> Annulable à tout moment
              </li>
            </ul>
            <a
              href={`/checkout/subscribe/${listingId}`}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-medium text-white"
            >
              S&apos;abonner
            </a>
            {priceCents > 0 && (
              <p className="mt-3 text-center text-xs text-ink-faint">
                Ou achat unique : {(priceCents / 100).toFixed(2)} €
              </p>
            )}
          </>
        )}

        {!isSubscription && priceCents > 0 && (
          <>
            <p className="mt-3 text-center text-2xl font-bold text-ink">
              {(priceCents / 100).toFixed(2)} €
            </p>
            <p className="mt-2 text-center text-sm text-ink-soft">
              Accès permanent à ce {type}
            </p>
            <a
              href={`/checkout/${listingId}`}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-medium text-white"
            >
              Acheter maintenant
            </a>
          </>
        )}
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

          {envFields.length > 0 && (
            <EnvFieldInputs
              fields={envFields.map((f) => ({
                key: f.key,
                label: f.label ?? f.description,
                help: f.help,
                type: f.type,
                required: f.required,
                connectorId: f.connectorId,
                paramKey: f.paramKey,
              }))}
              values={variables}
              onChange={(key, value) =>
                setVariables((prev) => ({ ...prev, [key]: value }))
              }
              requiredConnectors={requiredConnectors}
              provisioningMode={provisioningMode}
              title="Variables d'entrée"
            />
          )}

          {type === "prompt" && varNames.length > 0 && envFields.length === 0 && (
            <EnvFieldInputs
              fields={varNames.map((key) => ({
                key,
                label: key,
                required: true,
              }))}
              values={variables}
              onChange={(key, value) =>
                setVariables((prev) => ({ ...prev, [key]: value }))
              }
              requiredConnectors={requiredConnectors}
              provisioningMode={provisioningMode}
              title="Variables d'entrée"
            />
          )}

          {resourceFields.length > 0 && (
            <div className="mt-4">
              <RunResourceFields
                fields={resourceFields}
                values={resourceValues}
                onChange={setResourceValues}
              />
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

          <ConnectionsMasque
            requiredSecrets={secrets}
            requiredConnectors={requiredConnectors}
            onReadyChange={setConnectionsReady}
          />

          {requiredConnectors.length > 0 && (
            <p className="mt-3 text-xs text-ink-soft">
              Utilisez <strong>Aperçu</strong> pour simuler sans toucher vos comptes, ou{" "}
              <strong>Exécuter pour de vrai</strong> pour appeler les API réelles.
            </p>
          )}

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void handleAgentRun(true)}
              disabled={running || (!canAccess && !isFree)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-card py-2.5 text-sm font-medium text-ink disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {running && dryRun ? "Aperçu…" : "Aperçu (simulation)"}
            </button>
            <button
              type="button"
              onClick={() => void handleAgentRun(false)}
              disabled={running || (!canAccess && !isFree) || !connectionsReady}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {running && !dryRun ? "Exécution…" : "Exécuter pour de vrai"}
            </button>
          </div>

          {!canAccess && !isFree && !runMode && (
            <p className="mt-2 text-center text-xs text-ink-soft">
              Abonnez-vous ou achetez pour lancer cet agent.
            </p>
          )}

          {runMode === "byok" ? (
            <p className="mt-2 text-center text-xs text-green-600">Mode : vos clés API (BYOK)</p>
          ) : runMode === "credits" ? (
            <p className="mt-2 text-center text-xs text-blue-600">
              Mode : crédits Prompta (≈ {estimatedCredits} crédits)
            </p>
          ) : runMode === "free_quota" ? (
            <p className="mt-2 text-center text-xs text-ink-soft">Mode : quota gratuit</p>
          ) : hasAllSecrets() ? (
            <p className="mt-2 text-center text-xs text-ink-soft">Mode BYOK — vos clés API</p>
          ) : (
            <p className="mt-2 text-center text-xs text-ink-soft">
              ≈ {estimatedCredits} crédits (~{estimatedEur} €) si mode crédits
            </p>
          )}

          {(running || agentStatus) && !showImmersive && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowImmersive(true)}
                className="text-xs text-accent hover:underline"
              >
                Ouvrir la console plein écran →
              </button>
            </div>
          )}

          {showImmersive && (running || agentStatus) && (
            <AgentRunExperience
              title={title}
              status={agentStatus}
              runId={runId}
              stepsCompleted={stepsCompleted ?? 0}
              totalSteps={stepCount}
              stepTrace={stepTrace}
                pollWhileRunning={running}
              errorMessage={error}
              finalOutput={agentOutput}
              approvalId={approvalId}
              approvalDetails={approvalDetails}
              onApprove={handleApprove}
              onReject={handleReject}
              onRetry={() => void handleAgentRun()}
              onClose={() => setShowImmersive(false)}
            />
          )}

          {agentOutput && !showImmersive && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-medium text-ink-soft">Résultat</p>
              <pre className="max-h-60 overflow-auto rounded-lg bg-card2 p-3 text-xs whitespace-pre-wrap">
                {agentOutput}
              </pre>
            </div>
          )}

          {error && !showImmersive && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700">{error}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {error.toLowerCase().includes("clé") && (
                  <button
                    onClick={() => setShowWizard(true)}
                    className="rounded px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    Reconfigurer les clés
                  </button>
                )}
                <button
                  onClick={() => void handleAgentRun(dryRun)}
                  className="rounded px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                >
                  Réessayer
                </button>
              </div>
            </div>
          )}
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
                {hasRequiredKey()
                  ? "Tournera sur votre clé API (BYOK)"
                  : `≈ ${estimatedCredits} crédits (~${estimatedEur} €) en mode crédits`}
              </p>

              <button
                onClick={handleRun}
                disabled={running}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                {running ? "Exécution en cours…" : "Lancer l'exécution"}
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
