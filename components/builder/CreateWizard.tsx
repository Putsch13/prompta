"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, Plus, Loader2, AlertTriangle, Check } from "lucide-react";
import { StepEditor } from "@/components/builder/StepEditor";
import { CatalogMultiSelect } from "@/components/builder/CatalogMultiSelect";
import { CommissionNote } from "@/components/CommissionNote";
import { buildManifest } from "@/lib/builder/manifest";
import {
  AI_MODELS,
  TECH_RUNTIMES,
  INTEGRATIONS,
  getIntegrationsRequiringKey,
} from "@/lib/catalogs";
import type { AgentStep } from "@/lib/agent/schema";
import type { KeyProvider } from "@/lib/keys";

const STEPS = [
  "Type",
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
  const [testResult, setTestResult] = useState<{
    status: string;
    output?: Record<string, string>;
    error?: string;
    stepsCompleted?: number;
  } | null>(null);
  const [testInputs, setTestInputs] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    type: "prompt" as "prompt" | "agent" | "workflow",
    title: "",
    categoryId: "",
    description: "",
    models: ["gpt-4o"],
    techStack: [] as string[],
    integrations: [] as string[],
    tags: [] as string[],
    promptBody: "",
    agentSteps: [] as AgentStep[],
    envFields: [] as EnvField[],
    requiredSecrets: [] as KeyProvider[],
    dependencies: "",
    setupTime: "5 min",
    priceCents: 990,
    pricingMode: "free" as "free" | "one_time" | "subscription",
    subscriptionPriceCents: 990,
  });

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

  function suggestVariablesFromText(text: string) {
    const matches = text.match(/\{\{(\w+)\}\}/g) ?? [];
    const keys = Array.from(new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, ""))));
    const existing = new Map(form.envFields.map((f) => [f.key, f]));
    const merged = keys.map((key) => ({
      key,
      label: existing.get(key)?.label ?? `Variable ${key}`,
      required: existing.get(key)?.required ?? true,
    }));
    const extra = form.envFields.filter((f) => !keys.includes(f.key));
    updateField("envFields", [...merged, ...extra]);
  }

  function buildCurrentManifest() {
    return buildManifest({
      type: form.type,
      promptBody: form.promptBody,
      steps: form.agentSteps,
      envFields: form.envFields,
      requiredSecrets: form.requiredSecrets,
      defaultModel: form.models[0],
    });
  }

  async function handleSubmit(publish: boolean) {
    setSaving(true);
    const manifest = buildCurrentManifest();

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
    setTestRunning(true);
    setTestResult(null);
    const manifest = buildCurrentManifest();
    const res = await fetch("/api/run/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preview: true,
        manifest,
        inputs: testInputs,
        async: false,
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
          <h2 className="font-display text-xl font-bold text-ink">Type de contenu</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {(["prompt", "agent", "workflow"] as const).map((t) => (
              <button
                key={t}
                onClick={() => updateField("type", t)}
                className={`rounded-xl border p-4 text-left ${
                  form.type === t ? "border-accent bg-accent-light" : "border-line"
                }`}
              >
                <p className="font-medium capitalize text-ink">{t}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  {t === "prompt" && "Un appel modèle simple"}
                  {t === "agent" && "Chaîne + outils orchestrés"}
                  {t === "workflow" && "Séquence d'étapes LLM"}
                </p>
              </button>
            ))}
          </div>
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
            catalog={AI_MODELS}
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
                suggestVariablesFromText(e.target.value);
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
                  suggestVariablesFromText(allText);
                }}
                defaultModel={form.models[0]}
              />
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
            catalog={INTEGRATIONS}
            selected={form.integrations}
            onChange={(ids) => {
              updateField("integrations", ids);
              const integrationsNeedingKeys = getIntegrationsRequiringKey(ids);
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
            <p className="mb-2 text-sm font-medium text-ink">Variables d&apos;entrée</p>
            <div className="space-y-2">
              {form.envFields.map((f, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={f.key}
                    onChange={(e) => {
                      const fields = [...form.envFields];
                      fields[i] = { ...fields[i], key: e.target.value };
                      updateField("envFields", fields);
                    }}
                    placeholder="clé"
                    className="h-10 w-28 rounded-lg border border-line px-3 font-mono text-sm"
                  />
                  <input
                    value={f.label}
                    onChange={(e) => {
                      const fields = [...form.envFields];
                      fields[i] = { ...fields[i], label: e.target.value };
                      updateField("envFields", fields);
                    }}
                    placeholder="Label"
                    className="h-10 flex-1 rounded-lg border border-line px-3 text-sm"
                  />
                  <label className="flex items-center gap-1 text-xs text-ink-soft">
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
                    className="rounded p-2 text-destructive hover:bg-red-50"
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
                  { key: "", label: "", required: true },
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
              <CommissionNote priceCents={form.subscriptionPriceCents} />
            </>
          )}
        </div>
      )}

      {step === 5 && (
        <div>
          <h2 className="font-display text-xl font-bold text-ink">Test (Playground)</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Lancez votre manifeste avec vos clés API. Exécution synchrone (streaming simulé en
            V1 pour les prompts).
          </p>

          {form.envFields.length > 0 && (
            <div className="mt-4 space-y-2">
              {form.envFields.map((f) => (
                <div key={f.key}>
                  <label className="text-xs text-ink-soft">{f.label || f.key}</label>
                  <input
                    value={testInputs[f.key] ?? ""}
                    onChange={(e) =>
                      setTestInputs((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-line px-3 text-sm"
                  />
                </div>
              ))}
            </div>
          )}

          <button
            onClick={runPreview}
            disabled={testRunning}
            className="mt-4 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {testRunning && <Loader2 className="h-4 w-4 animate-spin" />}
            {testRunning ? "Exécution…" : "Lancer le test"}
          </button>

          {testResult && (
            <div className="mt-4 rounded-lg border border-line bg-card2 p-4">
              <p className="text-sm font-medium text-ink">
                Statut :{" "}
                <span
                  className={
                    testResult.status === "completed" ? "text-green-600" : "text-red-600"
                  }
                >
                  {testResult.status}
                </span>
                {testResult.stepsCompleted != null && (
                  <span className="text-ink-soft"> · {testResult.stepsCompleted} étape(s)</span>
                )}
              </p>
              {testResult.output?.result && (
                <pre className="mt-2 max-h-48 overflow-auto font-mono text-xs whitespace-pre-wrap">
                  {testResult.output.result}
                </pre>
              )}
              {testResult.error && (
                <p className="mt-2 text-sm text-destructive">{testResult.error}</p>
              )}
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
            onClick={() => setStep((s) => s + 1)}
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
