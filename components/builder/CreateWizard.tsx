"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, Plus, Loader2, AlertTriangle, Check, Wand2 } from "lucide-react";
import { StepEditor } from "@/components/builder/StepEditor";
import { EnvFieldInputs } from "@/components/builder/EnvFieldInputs";
import { TemplatePicker } from "@/components/builder/TemplatePicker";
import { AgentIdeaAssistant } from "@/components/builder/AgentIdeaAssistant";
import { CatalogMultiSelect } from "@/components/builder/CatalogMultiSelect";
import { CatalogSingleSelect } from "@/components/builder/CatalogSingleSelect";
import { CommissionNote } from "@/components/CommissionNote";
import { buildManifest } from "@/lib/builder/manifest";
import { PROVISIONING_OPTIONS, type ProvisioningMode } from "@/lib/builder/provisioning";
import { AgentRunExperience } from "@/components/run/AgentRunExperience";
import { AgentFlowPreview } from "@/components/builder/AgentFlowPreview";
import type { StepTraceEntry } from "@/lib/agent/orchestrator";
import { injectHumanApprovals } from "@/lib/connectors/approvals-inject";
import { dedupeConnectors } from "@/lib/connectors/resolve-id";
import {
  getGatewayModels,
  getBuilderModels,
  TECH_RUNTIMES,
  INTEGRATIONS,
  getIntegrationsRequiringKey,
  getConnectorIdsFromIntegrations,
} from "@/lib/catalogs";
import {
  extractInputVariables,
  keyToLabel,
  validateAgentSteps,
} from "@/lib/builder/variables";
import { validateAgentManifest, hasBlockingIssues } from "@/lib/builder/validate-agent";
import { connectorsForSteps } from "@/lib/connectors/registry";
import type { AgentTemplate } from "@/lib/templates/agent-templates";
import type { GeneratedSkeleton } from "@/lib/builder/generate-skeleton";
import type { GeneratedAgentPlan } from "@/lib/builder/generate-agent-plan";
import type { AgentStep, AgentKind, ExecutionMode } from "@/lib/agent/schema";
import type { KeyProvider } from "@/lib/keys";

const STEPS = [
  "Objectif",
  "Bases",
  "Contenu",
  "Environnement",
  "Tarification",
  "Test",
  "Publication",
];

const SECRET_PROVIDERS: { id: KeyProvider; label: string }[] = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "google", label: "Google AI" },
  { id: "mistral", label: "Mistral" },
  { id: "serper", label: "Serper" },
];

interface Props {
  categories: { id: string; name: string; slug: string }[];
}

interface EnvField {
  key: string;
  label: string;
  required: boolean;
  type: "text" | "textarea" | "number" | "file" | "list";
  help?: string;
}

export function CreateWizard({ categories }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<{
    canSell: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
  } | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const [testFullDemo, setTestFullDemo] = useState(false);
  const [includeHumanApprovals, setIncludeHumanApprovals] = useState(false);
  const [flowPreviewConfirmed, setFlowPreviewConfirmed] = useState(false);
  const [showTestImmersive, setShowTestImmersive] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: string;
    output?: Record<string, string>;
    error?: string;
    stepsCompleted?: number;
    stepTrace?: StepTraceEntry[];
    runId?: string;
  } | null>(null);
  const [testInputs, setTestInputs] = useState<Record<string, string>>({});
  const [suggestedVars, setSuggestedVars] = useState<string[]>([]);
  const [stepError, setStepError] = useState<string | null>(null);
  const [integrationCatalog, setIntegrationCatalog] = useState(INTEGRATIONS);

  useEffect(() => {
    fetch("/api/composio/toolkits")
      .then((r) => r.json())
      .then((d) => {
        if (d.enabled && Array.isArray(d.toolkits) && d.toolkits.length > 0) {
          setIntegrationCatalog(
            d.toolkits.map((t: { id: string; label: string; category: string; popular: boolean; authType: string; connectorId: string }) => ({
              id: t.id,
              label: t.label,
              category: t.category,
              popular: t.popular,
              authType: t.authType as "oauth" | "api_key",
              connectorId: t.connectorId ?? t.id,
            }))
          );
        }
      })
      .catch(() => undefined);
  }, []);

  const [objectiveText, setObjectiveText] = useState("");
  const [builderModel, setBuilderModel] = useState("gpt-5.4-mini");
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedAgentPlan | null>(null);

  const [form, setForm] = useState({
    type: "prompt" as "prompt" | "agent" | "workflow",
    kind: undefined as AgentKind | undefined,
    executionMode: undefined as ExecutionMode | undefined,
    title: "",
    categoryId: "",
    description: "",
    models: ["gpt-5.4"],
    techStack: [] as string[],
    integrations: [] as string[],
    tags: [] as string[],
    promptBody: "",
    agentSteps: [] as AgentStep[],
    envFields: [] as EnvField[],
    requiredSecrets: [] as KeyProvider[],
    requiredConnectors: [] as string[],
    dependencies: "",
    setupTime: "5 min",
    priceCents: 990,
    pricingMode: "free" as "free" | "one_time" | "subscription",
    subscriptionPriceCents: 990,
    provisioningMode: "manual" as ProvisioningMode,
    hostingEnabled: false,
    hostingFeeCents: 490,
  });

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>();

  function applyTemplate(template: AgentTemplate) {
    setSelectedTemplateId(template.id);
    setForm((prev) => ({
      ...prev,
      type: template.type,
      title: template.label,
      description: template.description,
      models: template.models,
      tags: template.tags,
      integrations: template.integrations,
      agentSteps: template.steps,
      envFields: template.envFields,
      requiredSecrets: template.requiredSecrets,
      requiredConnectors: template.requiredConnectors,
      setupTime: template.setupTime,
    }));
    const allText = template.steps
      .filter((s) => s.type === "llm")
      .map((s) => s.prompt)
      .join("\n");
    const keys = extractInputVariables(allText);
    const existing = new Set(template.envFields.map((f) => f.key));
    setSuggestedVars(keys.filter((k) => !existing.has(k)));
  }

  function applySkeleton(skeleton: GeneratedSkeleton) {
    setSelectedTemplateId(undefined);
    setForm((prev) => ({
      ...prev,
      type: skeleton.type,
      title: skeleton.title,
      description: skeleton.description,
      models: skeleton.models,
      tags: skeleton.tags,
      integrations: skeleton.integrations ?? prev.integrations,
      agentSteps: skeleton.steps as AgentStep[],
      envFields: skeleton.envFields.map((f) => ({
        key: f.key,
        label: f.label,
        required: f.required,
        type: f.type ?? "text",
        help: f.help,
      })),
      requiredSecrets: (skeleton.requiredSecrets ?? ["openai"]).filter((s): s is KeyProvider =>
        SECRET_PROVIDERS.some((p) => p.id === s)
      ),
    }));
    const allText = skeleton.steps.map((s) => s.prompt).join("\n");
    const keys = extractInputVariables(allText);
    const existing = new Set(skeleton.envFields.map((f) => f.key));
    setSuggestedVars(keys.filter((k) => !existing.has(k)));
  }

  function applyPlan(plan: GeneratedAgentPlan) {
    setGeneratedPlan(plan);
    const agentSteps: AgentStep[] = plan.steps
      .filter((s) => s.type === "llm" || s.type === "action" || s.type === "tool" || s.type === "code")
      .map((s) => {
        if (s.type === "llm") {
          return { type: "llm" as const, model: form.models[0], prompt: s.description, outputKey: s.outputKey };
        }
        if (s.type === "action" && s.connectorId && s.actionSlug) {
          return { type: "action" as const, connector: s.connectorId, action: s.actionSlug, params: {}, outputKey: s.outputKey };
        }
        if (s.type === "tool") {
          const toolId = (s.actionSlug === "web_search" || s.actionSlug === "http_fetch" || s.actionSlug === "file_read")
            ? s.actionSlug : "web_search";
          return { type: "tool" as const, tool: toolId as "web_search" | "http_fetch" | "file_read", params: {}, outputKey: s.outputKey };
        }
        return { type: "llm" as const, model: form.models[0], prompt: s.description, outputKey: s.outputKey };
      });

    const connectorIds = plan.requiredConnectors.map((c) => c.connectorId);

    setForm((prev) => ({
      ...prev,
      type: plan.kind,
      kind: plan.kind,
      title: plan.title,
      description: plan.description,
      agentSteps,
      envFields: plan.variables.map((v) => ({
        key: v.key,
        label: v.label,
        required: v.required,
        type: (v.type === "text" || v.type === "number" || v.type === "file") ? v.type as "text" | "number" | "file" : "text" as const,
      })),
      requiredConnectors: connectorIds,
    }));
    setSelectedTemplateId(undefined);
  }

  async function handleGeneratePlan() {
    if (objectiveText.trim().length < 10) {
      setPlanError("Décrivez votre objectif en quelques phrases (min. 10 caractères).");
      return;
    }
    setPlanLoading(true);
    setPlanError(null);
    try {
      const res = await fetch("/api/builder/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: objectiveText.trim(), modelId: builderModel }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPlanError(data.error || "Erreur de génération");
        return;
      }
      applyPlan(data.plan);
    } catch {
      setPlanError("Erreur réseau. Réessayez.");
    } finally {
      setPlanLoading(false);
    }
  }

  const loadStripeStatus = useCallback(async () => {
    const res = await fetch("/api/stripe/connect");
    if (res.ok) {
      const data = await res.json();
      setStripeStatus({
        canSell: !!data.charges_enabled && !!data.payouts_enabled,
        chargesEnabled: !!data.charges_enabled,
        payoutsEnabled: !!data.payouts_enabled,
      });
    }
  }, []);

  useEffect(() => {
    if (step === 4) loadStripeStatus();
  }, [step, loadStripeStatus]);

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function detectVariablesInText(text: string) {
    const keys = extractInputVariables(text);
    const existing = new Set(form.envFields.map((f) => f.key));
    setSuggestedVars(keys.filter((k) => !existing.has(k)));
  }

  function addSuggestedVariable(key: string) {
    updateField("envFields", [
      ...form.envFields,
      { key, label: keyToLabel(key), required: true, type: "text" as const },
    ]);
    setSuggestedVars((prev) => prev.filter((k) => k !== key));
  }

  function validateCurrentManifest(): string | null {
    if (form.type === "prompt") return null;
    const manifest = buildCurrentManifest();
    const legacyIssues = validateAgentSteps(manifest.steps);
    if (legacyIssues.length > 0) return legacyIssues[0].message;
    const issues = validateAgentManifest(manifest.steps, { connectors: manifest.connectors });
    const blocking = issues.find((i) => i.severity === "error");
    return blocking?.message ?? null;
  }

  function canContinueFromStep(current: number): boolean {
    setStepError(null);
    if (current === 2 && form.type !== "prompt") {
      const err = validateCurrentManifest();
      if (err) {
        setStepError(err);
        return false;
      }
    }
    return true;
  }

  function buildCurrentManifest() {
    let steps = form.agentSteps;
    if (includeHumanApprovals && form.type !== "prompt") {
      steps = injectHumanApprovals(steps);
    }
    return buildManifest({
      type: form.type,
      kind: form.kind,
      executionMode: form.executionMode,
      promptBody: form.promptBody,
      steps,
      envFields: form.envFields,
      requiredSecrets: form.requiredSecrets,
      requiredConnectors: form.requiredConnectors,
      defaultModel: form.models[0],
      provisioningMode: form.provisioningMode,
    });
  }

  const previewSteps = includeHumanApprovals && form.type !== "prompt"
    ? injectHumanApprovals(form.agentSteps)
    : form.agentSteps;

  async function handleSubmit(publish: boolean) {
    setSaving(true);
    const manifest = buildCurrentManifest();
    const validationErr = validateCurrentManifest();
    if (validationErr) {
      setStepError(validationErr);
      setSaving(false);
      return;
    }
    if (publish && hasBlockingIssues(validateAgentManifest(manifest.steps, { connectors: manifest.connectors }))) {
      setStepError("Corrigez les erreurs du manifeste avant publication.");
      setSaving(false);
      return;
    }

    const res = await fetch("/api/listings/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        type: form.type,
        categoryId: form.categoryId || null,
        description: form.description,
        models: form.models,
        techStack: form.techStack,
        integrations: form.integrations,
        tags: form.tags,
        priceCents: form.pricingMode === "free" ? 0 : form.priceCents,
        pricingMode: form.pricingMode,
        subscriptionPriceCents: form.subscriptionPriceCents,
        hostingFeeCents: form.hostingEnabled ? form.hostingFeeCents : 0,
        provisioningMode: form.provisioningMode,
        promptBody: form.promptBody,
        manifest,
        setupTime: form.setupTime,
      }),
    });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      alert(data.message || data.error || "Erreur");
      return;
    }

    if (publish && data.id) {
      await fetch("/api/listings/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: data.id, publish: true }),
      });
    }
    router.push("/dashboard");
  }

  async function runPreview() {
    if (!flowPreviewConfirmed && form.agentSteps.length > 0) {
      alert("Validez d'abord l'arborescence de l'agent.");
      return;
    }
    setTestRunning(true);
    setTestResult(null);
    setShowTestImmersive(true);
    const manifest = buildCurrentManifest();
    const res = await fetch("/api/run/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preview: true,
        manifest,
        inputs: testInputs,
        async: false,
        fullDemo: testFullDemo,
      }),
    });
    const data = await res.json();
    setTestRunning(false);
    if (res.ok) {
      setTestResult(data);
    } else {
      setTestResult({ status: "failed", error: data.error || data.message });
    }
  }

  return (
    <div className="rounded-xl border border-line bg-card p-6">
      <div className="mb-8 flex gap-1">
        {STEPS.map((label, i) => (
          <div key={label} className="flex-1">
            <div className={`h-1 rounded-full ${i <= step ? "bg-accent" : "bg-line"}`} />
            <p className="mt-1 hidden text-[10px] text-ink-faint sm:block">{label}</p>
          </div>
        ))}
      </div>

      {step === 0 && (
        <div>
          <h2 className="font-display text-xl font-bold text-ink">Quel est votre objectif ?</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Décrivez en langage naturel ce que vous voulez automatiser. Prompta générera un plan avec les étapes, outils et connexions nécessaires.
          </p>
          <textarea
            value={objectiveText}
            onChange={(e) => setObjectiveText(e.target.value)}
            placeholder="Ex. Quand je reçois un email de réclamation, analyser le sentiment, chercher le client dans HubSpot et rédiger une réponse empathique…"
            rows={4}
            className="mt-4 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm"
          />
          <div className="mt-4">
            <p className="mb-1 text-xs font-medium text-ink-soft">Modèle IA pour la génération</p>
            <CatalogSingleSelect
              catalog={getBuilderModels() as { id: string; label: string; provider?: string }[]}
              value={builderModel}
              onChange={setBuilderModel}
              groupByKey="provider"
              placeholder="Choisir OpenAI, Anthropic, Google…"
            />
            <p className="mt-1 text-[11px] text-ink-faint">
              Utilise votre clé BYOK du fournisseur choisi, ou la clé plateforme si configurée.
            </p>
          </div>
          {planError && <p className="mt-2 text-xs text-destructive">{planError}</p>}
          <button
            type="button"
            onClick={handleGeneratePlan}
            disabled={planLoading}
            className="mt-3 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {planLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {planLoading ? "Analyse en cours…" : "Générer le plan"}
          </button>

          {generatedPlan && (
            <div className="mt-6 rounded-xl border border-accent/30 bg-accent/5 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink">{generatedPlan.title}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">{generatedPlan.description}</p>
                </div>
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent capitalize">
                  {generatedPlan.kind}
                </span>
              </div>
              <div className="mt-3 space-y-1.5">
                {generatedPlan.steps.map((s, i) => (
                  <div key={s.id} className="flex items-start gap-2 text-xs">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-bold text-accent">
                      {i + 1}
                    </span>
                    <div>
                      <span className="font-medium text-ink">{s.name}</span>
                      <span className="ml-1 rounded bg-line/80 px-1 py-0.5 text-[10px] text-ink-faint">{s.type}</span>
                      {s.connectorId && (
                        <span className="ml-1 rounded bg-blue-50 px-1 py-0.5 text-[10px] text-blue-600">{s.connectorId}</span>
                      )}
                      {s.requiresApproval && (
                        <span className="ml-1 rounded bg-amber-50 px-1 py-0.5 text-[10px] text-amber-600">approbation</span>
                      )}
                      <p className="text-ink-soft">{s.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              {generatedPlan.requiredConnectors.length > 0 && (
                <div className="mt-3 border-t border-line pt-2">
                  <p className="text-xs font-medium text-ink-soft">Connexions requises :</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {generatedPlan.requiredConnectors.map((c) => (
                      <span key={c.connectorId} className="rounded-full border border-line px-2 py-0.5 text-xs text-ink">{c.connectorId}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 border-t border-line pt-4">
            <p className="text-xs font-medium text-ink-soft">Ou choisissez manuellement le type :</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {(["prompt", "agent", "workflow"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    updateField("type", t);
                    updateField("kind", t);
                    setGeneratedPlan(null);
                  }}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    form.type === t && !generatedPlan ? "border-accent bg-accent-light" : "border-line hover:border-accent/50"
                  }`}
                >
                  <p className="text-sm font-medium capitalize text-ink">{t}</p>
                  <p className="mt-0.5 text-[11px] text-ink-soft">
                    {t === "prompt" && "Un appel modèle simple"}
                    {t === "agent" && "Chaîne + outils orchestrés"}
                    {t === "workflow" && "Séquence d'étapes déterministe"}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {!generatedPlan && (form.type === "agent" || form.type === "workflow") && (
            <>
              <TemplatePicker selectedId={selectedTemplateId} onSelect={applyTemplate} />
              <AgentIdeaAssistant onGenerated={applySkeleton} builderModel={builderModel} />
            </>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <h2 className="font-display text-xl font-bold text-ink">Informations de base</h2>
          <input
            value={form.title}
            onChange={(e) => updateField("title", e.target.value)}
            placeholder="Titre"
            className="h-10 w-full rounded-lg border border-line px-3"
          />
          <select
            value={form.categoryId}
            onChange={(e) => updateField("categoryId", e.target.value)}
            className="h-10 w-full rounded-lg border border-line px-3"
          >
            <option value="">Catégorie</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <textarea
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder="Description"
            rows={3}
            className="w-full rounded-lg border border-line px-3 py-2"
          />

          <CatalogMultiSelect
            catalog={getGatewayModels()}
            selected={form.models}
            onChange={(ids) => updateField("models", ids)}
            label="Modèles IA compatibles"
            groupByKey="provider"
            placeholder="Rechercher un modèle…"
          />
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="font-display text-xl font-bold text-ink">Contenu</h2>
          {form.type === "prompt" ? (
            <textarea
              value={form.promptBody}
              onChange={(e) => {
                updateField("promptBody", e.target.value);
                detectVariablesInText(e.target.value);
              }}
              placeholder="Corps du prompt — utilisez {{variable}} pour les champs dynamiques"
              rows={12}
              className="mt-4 w-full rounded-lg border border-line px-3 py-2 font-mono text-sm"
            />
          ) : (
            <div className="mt-4">
              <p className="mb-3 text-sm text-ink-soft">
                Composez les étapes de votre {form.type}. Chaque prompt peut référencer{" "}
                <code className="text-xs">{"{{step_N_output}}"}</code>.
              </p>
              <StepEditor
                steps={form.agentSteps}
                onChange={(s) => {
                  updateField("agentSteps", s);
                  const allText = s
                    .filter((st) => st.type === "llm")
                    .map((st) => st.prompt)
                    .join("\n");
                  detectVariablesInText(allText);
                  const connectorIds = connectorsForSteps(s);
                  if (connectorIds.length) {
                    updateField("requiredConnectors", connectorIds);
                  }
                }}
                defaultModel={form.models[0]}
                envFields={form.envFields}
              />
              {stepError && <p className="mt-2 text-sm text-destructive">{stepError}</p>}
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="font-display text-xl font-bold text-ink">Environnement</h2>
          <p className="text-sm text-ink-soft">
            Runtime, intégrations, variables d&apos;entrée et clés API requises.
          </p>

          <CatalogMultiSelect
            catalog={TECH_RUNTIMES}
            selected={form.techStack}
            onChange={(ids) => updateField("techStack", ids)}
            label="Runtime / Tech requise"
            placeholder="Rechercher un runtime…"
          />

          <CatalogMultiSelect
            catalog={integrationCatalog}
            selected={form.integrations}
            onChange={(ids) => {
              updateField("integrations", ids);
              const integrationsNeedingKeys = getIntegrationsRequiringKey(ids);
              const connectorIds = ids.filter((id) =>
                integrationCatalog.some((i) => i.id === id && (i.connectorId || i.authType === "oauth"))
              ).map((id) => integrationCatalog.find((i) => i.id === id)?.connectorId ?? id);
              const legacyConnectorIds = getConnectorIdsFromIntegrations(ids);
              const allConnectors = Array.from(new Set([...connectorIds, ...legacyConnectorIds]));
              if (allConnectors.length) {
                updateField("requiredConnectors", Array.from(new Set([...form.requiredConnectors, ...allConnectors])));
              }
              if (integrationsNeedingKeys.length > 0) {
                const newSecrets = [...form.requiredSecrets];
                for (const int of integrationsNeedingKeys) {
                  const key = int.id as KeyProvider;
                  if (!newSecrets.includes(key) && SECRET_PROVIDERS.some((p) => p.id === key)) {
                    newSecrets.push(key);
                  }
                }
                if (newSecrets.length !== form.requiredSecrets.length) {
                  updateField("requiredSecrets", newSecrets);
                }
              }
            }}
            label="Intégrations connectées"
            groupByKey="category"
            placeholder="Rechercher une intégration…"
          />

          <div className="border-t border-line pt-4">
            <p className="mb-1 text-sm font-medium text-ink">Que doit fournir l&apos;utilisateur final ?</p>
            <p className="mb-3 text-xs text-ink-soft">
              Définissez explicitement les variables d&apos;entrée. Les sorties d&apos;étapes (
              <code>step_N_output</code>) sont gérées automatiquement.
            </p>

            {suggestedVars.length > 0 && (
              <div className="mb-3 rounded-lg border border-accent/30 bg-accent-light/50 p-3">
                <p className="text-xs font-medium text-accent">Variables détectées dans vos prompts</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {suggestedVars.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => addSuggestedVariable(key)}
                      className="rounded border border-accent px-2 py-1 text-xs text-accent hover:bg-accent-light"
                    >
                      + {keyToLabel(key)} ({key})
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              {form.envFields.map((f, i) => (
                <div key={i} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-2">
                  <input
                    value={f.key}
                    onChange={(e) => {
                      const fields = [...form.envFields];
                      fields[i] = { ...fields[i], key: e.target.value };
                      updateField("envFields", fields);
                    }}
                    placeholder="clé (ex: secteur)"
                    className="h-10 rounded-lg border border-line px-3 font-mono text-sm"
                  />
                  <input
                    value={f.label}
                    onChange={(e) => {
                      const fields = [...form.envFields];
                      fields[i] = { ...fields[i], label: e.target.value };
                      updateField("envFields", fields);
                    }}
                    placeholder="Label visible"
                    className="h-10 rounded-lg border border-line px-3 text-sm"
                  />
                  <select
                    value={f.type}
                    onChange={(e) => {
                      const fields = [...form.envFields];
                      fields[i] = { ...fields[i], type: e.target.value as EnvField["type"] };
                      updateField("envFields", fields);
                    }}
                    className="h-10 rounded-lg border border-line px-3 text-sm"
                  >
                    <option value="text">Texte court</option>
                    <option value="textarea">Texte long</option>
                    <option value="number">Nombre</option>
                    <option value="file">Fichier</option>
                    <option value="list">Liste</option>
                  </select>
                  <input
                    value={f.help ?? ""}
                    onChange={(e) => {
                      const fields = [...form.envFields];
                      fields[i] = { ...fields[i], help: e.target.value };
                      updateField("envFields", fields);
                    }}
                    placeholder="Aide / exemple (optionnel)"
                    className="h-10 rounded-lg border border-line px-3 text-sm"
                  />
                  <label className="flex items-center gap-1 text-xs text-ink-soft sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={f.required}
                      onChange={(e) => {
                        const fields = [...form.envFields];
                        fields[i] = { ...fields[i], required: e.target.checked };
                        updateField("envFields", fields);
                      }}
                    />
                    Requis
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      updateField(
                        "envFields",
                        form.envFields.filter((_, j) => j !== i)
                      )
                    }
                    className="rounded p-2 text-destructive hover:bg-red-50 sm:col-span-2 sm:justify-self-end"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() =>
                updateField("envFields", [
                  ...form.envFields,
                  { key: "", label: "", required: true, type: "text" },
                ])
              }
              className="mt-2 flex items-center gap-1 text-sm text-accent hover:underline"
            >
              <Plus className="h-4 w-4" /> Ajouter une variable
            </button>
          </div>

          <div className="border-t border-line pt-4">
            <p className="mb-2 text-sm font-medium text-ink">Clés API requises</p>
            <div className="flex flex-wrap gap-2">
              {SECRET_PROVIDERS.map((p) => {
                const selected = form.requiredSecrets.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      updateField(
                        "requiredSecrets",
                        selected
                          ? form.requiredSecrets.filter((s) => s !== p.id)
                          : [...form.requiredSecrets, p.id]
                      )
                    }
                    className={`rounded-lg border px-3 py-1.5 text-sm ${
                      selected ? "border-accent bg-accent-light text-accent" : "border-line"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {(form.type === "agent" || form.type === "workflow") && (
            <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
              <p className="text-sm font-semibold text-ink">Expérience utilisateur final</p>
              <p className="mt-1 text-xs text-ink-soft">
                Choisissez combien l&apos;agent prépare à la place de l&apos;utilisateur.
              </p>
              <div className="mt-3 space-y-2">
                {PROVISIONING_OPTIONS.map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                      form.provisioningMode === opt.id
                        ? "border-violet-400 bg-white"
                        : "border-line bg-card"
                    }`}
                  >
                    <input
                      type="radio"
                      name="provisioningMode"
                      checked={form.provisioningMode === opt.id}
                      onChange={() => {
                        updateField("provisioningMode", opt.id);
                        if (opt.id === "managed" && !form.hostingEnabled) {
                          updateField("hostingEnabled", true);
                        }
                      }}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-medium text-ink">{opt.label}</p>
                      <p className="text-xs text-ink-soft">{opt.description}</p>
                      <p className="mt-1 text-[11px] text-ink-faint">{opt.forUser}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          <input
            value={form.setupTime}
            onChange={(e) => updateField("setupTime", e.target.value)}
            placeholder="Temps de setup estimé (ex: 5 min)"
            className="h-10 w-full rounded-lg border border-line px-3"
          />
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <h2 className="font-display text-xl font-bold text-ink">Tarification</h2>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="mb-1 inline h-4 w-4" /> Seuls les comptes avec Stripe
            validé peuvent vendre des prompts, agents et workflows payants.{" "}
            <Link href="/dashboard/payouts" className="font-medium text-accent hover:underline">
              Configurer Stripe →
            </Link>
            {stripeStatus && (
              <p className="mt-2">
                {stripeStatus.canSell ? (
                  <span className="flex items-center gap-1 text-green-700">
                    <Check className="h-4 w-4" /> KYC validé — vente payante autorisée
                  </span>
                ) : (
                  <span className="text-amber-800">
                    KYC incomplet (charges: {stripeStatus.chargesEnabled ? "✓" : "✗"}, payouts:{" "}
                    {stripeStatus.payoutsEnabled ? "✓" : "✗"})
                  </span>
                )}
              </p>
            )}
          </div>

          {(["free", "one_time", "subscription"] as const).map((mode) => (
            <label key={mode} className="flex items-center gap-2">
              <input
                type="radio"
                checked={form.pricingMode === mode}
                onChange={() => updateField("pricingMode", mode)}
              />
              {mode === "free" && "Gratuit"}
              {mode === "one_time" && "Achat unique"}
              {mode === "subscription" && "Abonnement mensuel (recommandé pour agents)"}
            </label>
          ))}

          {form.pricingMode === "one_time" && (
            <>
              <input
                type="number"
                value={form.priceCents / 100}
                onChange={(e) =>
                  updateField("priceCents", Math.round(parseFloat(e.target.value || "0") * 100))
                }
                placeholder="Prix en €"
                className="h-10 w-full rounded-lg border border-line px-3"
              />
              <CommissionNote priceCents={form.priceCents} />
            </>
          )}

          {form.pricingMode === "subscription" && (
            <>
              <input
                type="number"
                value={form.subscriptionPriceCents / 100}
                onChange={(e) =>
                  updateField(
                    "subscriptionPriceCents",
                    Math.round(parseFloat(e.target.value || "0") * 100)
                  )
                }
                placeholder="Prix abonnement €/mois"
                className="h-10 w-full rounded-lg border border-line px-3"
              />
              <p className="text-xs text-ink-soft">
                Abonnement {(form.subscriptionPriceCents / 100).toFixed(2)} €/mois ={" "}
                {((form.subscriptionPriceCents * 12) / 100).toFixed(0)} €/an récurrent · Achat unique{" "}
                {(form.priceCents / 100).toFixed(2)} € = une fois
              </p>
              <CommissionNote priceCents={form.subscriptionPriceCents} />
            </>
          )}

          {(form.type === "agent" || form.type === "workflow") && (
            <div className="rounded-xl border border-line bg-card2 p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.hostingEnabled}
                  onChange={(e) => updateField("hostingEnabled", e.target.checked)}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-medium text-ink">Frais d&apos;hébergement Prompta</p>
                  <p className="mt-1 text-xs text-ink-soft">
                    Facturation mensuelle pour exécuter, stocker et maintenir l&apos;agent actif
                    (recommandé en mode clé en main).
                  </p>
                </div>
              </label>
              {form.hostingEnabled && (
                <div className="mt-3">
                  <label className="text-xs text-ink-soft">Montant mensuel (€)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={form.hostingFeeCents / 100}
                    onChange={(e) =>
                      updateField(
                        "hostingFeeCents",
                        Math.round(parseFloat(e.target.value || "0") * 100)
                      )
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-line px-3"
                  />
                  <p className="mt-1 text-[11px] text-ink-faint">
                    Ex. 4,90 €/mois — couvre runtime, logs, connexions et mises à jour de
                    l&apos;agent publié.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {step === 5 && (
        <div>
          <h2 className="font-display text-xl font-bold text-ink">Test (Playground)</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Visualisez l&apos;arborescence, configurez les validations humaines, puis lancez une démo complète.
          </p>

          {form.agentSteps.length > 0 && (
            <div className="mt-4">
              <AgentFlowPreview
                steps={previewSteps}
                provisioningMode={form.provisioningMode}
                confirmed={flowPreviewConfirmed}
                onConfirm={() => setFlowPreviewConfirmed(true)}
              />
            </div>
          )}

          <div className="mt-4 space-y-3 rounded-xl border border-line bg-card2 p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={includeHumanApprovals}
                onChange={(e) => {
                  setIncludeHumanApprovals(e.target.checked);
                  setFlowPreviewConfirmed(false);
                }}
                className="mt-1 rounded border-line"
              />
              <span>
                <span className="text-sm font-medium text-ink">Validations humaines</span>
                <span className="mt-0.5 block text-xs text-ink-soft">
                  Insère une étape d&apos;approbation avant chaque action sensible (envoi email, écriture Sheets…).
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={testFullDemo}
                onChange={(e) => setTestFullDemo(e.target.checked)}
                className="mt-1 rounded border-line"
              />
              <span>
                <span className="text-sm font-medium text-ink">Démo complète (exécution réelle)</span>
                <span className="mt-0.5 block text-xs text-ink-soft">
                  Appels réels aux connecteurs — sans simulation. Les validations humaines sont auto-approuvées dans le builder.
                </span>
              </span>
            </label>
          </div>

          {form.envFields.filter((f) => f.key).length > 0 && (
            <EnvFieldInputs
              fields={form.envFields}
              values={testInputs}
              onChange={(key, value) =>
                setTestInputs((prev) => ({ ...prev, [key]: value }))
              }
              requiredConnectors={dedupeConnectors(
                Array.from(
                  new Set([
                    ...form.requiredConnectors,
                    ...connectorsForSteps(form.agentSteps),
                  ])
                )
              )}
              provisioningMode={form.provisioningMode}
            />
          )}

          {showTestImmersive && (testRunning || testResult) && (
            <AgentRunExperience
              title={form.title || "Test agent"}
              status={testRunning ? "running" : testResult?.status ?? null}
              stepsCompleted={testResult?.stepsCompleted ?? 0}
              totalSteps={previewSteps.length}
              stepTrace={testResult?.stepTrace}
              pollWhileRunning={testRunning}
              errorMessage={testResult?.error ?? null}
              finalOutput={testResult?.output?.result}
              onClose={() => setShowTestImmersive(false)}
            />
          )}

          <button
            onClick={runPreview}
            disabled={testRunning || (form.agentSteps.length > 0 && !flowPreviewConfirmed)}
            className="mt-4 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {testRunning && <Loader2 className="h-4 w-4 animate-spin" />}
            {testRunning
              ? "Exécution…"
              : testFullDemo
                ? "Lancer la démo complète"
                : "Lancer le test (simulation)"}
          </button>

          {form.agentSteps.length > 0 && !flowPreviewConfirmed && (
            <p className="mt-2 text-xs text-amber-700">
              Validez l&apos;arborescence ci-dessus avant de lancer le test.
            </p>
          )}

          {testResult?.error && !showTestImmersive && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-destructive">
              {testResult.error}
            </p>
          )}

          {testResult?.status === "completed" && testResult.output?.result && !showTestImmersive && (
            <div className="mt-4 rounded-xl border border-line bg-card p-4">
              <p className="text-xs font-bold uppercase text-ink-soft">Livrable final</p>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-sm text-ink">
                {testResult.output.result}
              </pre>
            </div>
          )}
        </div>
      )}

      {step === 6 && (
        <div>
          <h2 className="font-display text-xl font-bold text-ink">Publication</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Votre contenu sera soumis à validation avant publication.
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <div><dt className="text-ink-faint">Titre</dt><dd className="font-medium">{form.title}</dd></div>
            <div><dt className="text-ink-faint">Type</dt><dd className="font-medium capitalize">{form.type}</dd></div>
            <div><dt className="text-ink-faint">Tarif</dt><dd className="font-medium">{form.pricingMode}</dd></div>
            <div><dt className="text-ink-faint">Étapes</dt><dd className="font-medium">{buildCurrentManifest().steps.length}</dd></div>
          </dl>
        </div>
      )}

      <div className="mt-8 flex justify-between">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="rounded-lg border border-line px-4 py-2 text-sm disabled:opacity-50"
        >
          Retour
        </button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => {
              if (canContinueFromStep(step)) setStep((s) => s + 1);
            }}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Continuer
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => handleSubmit(false)}
              disabled={saving}
              className="rounded-lg border border-line px-4 py-2 text-sm"
            >
              Brouillon
            </button>
            <button
              onClick={() => handleSubmit(true)}
              disabled={saving}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              {saving ? "Envoi…" : "Publier"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
