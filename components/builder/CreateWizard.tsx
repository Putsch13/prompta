"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STEPS = [
  "Type",
  "Bases",
  "Contenu",
  "Environnement",
  "Tarification",
  "Test",
  "Publication",
];

interface Props {
  categories: { id: string; name: string; slug: string }[];
}

export function CreateWizard({ categories }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    type: "prompt" as "prompt" | "agent" | "workflow",
    title: "",
    categoryId: "",
    description: "",
    models: ["gpt-4o"],
    tags: [] as string[],
    promptBody: "",
    envFields: [] as { key: string; description: string; required: boolean }[],
    dependencies: "",
    setupTime: "5 min",
    priceCents: 0,
    pricingMode: "free" as "free" | "one_time" | "subscription",
    subscriptionPriceCents: 990,
  });

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function detectVariables(text: string) {
    const matches = text.match(/\{\{(\w+)\}\}/g) ?? [];
    const keys = Array.from(new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, ""))));
    updateField(
      "envFields",
      keys.map((key) => ({
        key,
        description: `Variable ${key}`,
        required: true,
      }))
    );
  }

  async function handleSubmit(publish: boolean) {
    setSaving(true);
    const res = await fetch("/api/listings/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        type: form.type,
        categoryId: form.categoryId || null,
        description: form.description,
        models: form.models,
        tags: form.tags,
        priceCents: form.pricingMode === "free" ? 0 : form.priceCents,
        promptBody: form.promptBody,
        envFields: form.envFields,
        dependencies: form.dependencies,
        setupTime: form.setupTime,
      }),
    });

    const data = await res.json();
    setSaving(false);

    if (res.ok) {
      if (publish && data.id) {
        await fetch("/api/listings/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId: data.id, publish: true }),
        });
      }
      router.push("/dashboard");
    }
  }

  return (
    <div className="rounded-xl border border-line bg-card p-6">
      <div className="mb-8 flex gap-1">
        {STEPS.map((label, i) => (
          <div key={label} className="flex-1">
            <div
              className={`h-1 rounded-full ${i <= step ? "bg-accent" : "bg-line"}`}
            />
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
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="font-display text-xl font-bold text-ink">Contenu</h2>
          <textarea
            value={form.promptBody}
            onChange={(e) => {
              updateField("promptBody", e.target.value);
              detectVariables(e.target.value);
            }}
            placeholder="Corps du prompt — utilisez {{variable}} pour les champs dynamiques"
            rows={12}
            className="mt-4 w-full rounded-lg border border-line px-3 py-2 font-mono text-sm"
          />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="font-display text-xl font-bold text-ink">Environnement</h2>
          {form.envFields.map((f, i) => (
            <div key={i} className="flex gap-2">
              <input value={f.key} readOnly className="h-10 flex-1 rounded-lg border border-line bg-card2 px-3 font-mono text-sm" />
              <input
                value={f.description}
                onChange={(e) => {
                  const fields = [...form.envFields];
                  fields[i] = { ...fields[i], description: e.target.value };
                  updateField("envFields", fields);
                }}
                className="h-10 flex-[2] rounded-lg border border-line px-3 text-sm"
              />
            </div>
          ))}
          <input
            value={form.dependencies}
            onChange={(e) => updateField("dependencies", e.target.value)}
            placeholder="Dépendances (ex: Node 18+)"
            className="h-10 w-full rounded-lg border border-line px-3"
          />
          <input
            value={form.setupTime}
            onChange={(e) => updateField("setupTime", e.target.value)}
            placeholder="Temps de setup"
            className="h-10 w-full rounded-lg border border-line px-3"
          />
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <h2 className="font-display text-xl font-bold text-ink">Tarification</h2>
          {(["free", "one_time", "subscription"] as const).map((mode) => (
            <label key={mode} className="flex items-center gap-2">
              <input
                type="radio"
                checked={form.pricingMode === mode}
                onChange={() => updateField("pricingMode", mode)}
              />
              {mode === "free" && "Gratuit"}
              {mode === "one_time" && "Achat unique"}
              {mode === "subscription" && "Abonnement mensuel"}
            </label>
          ))}
          {form.pricingMode === "one_time" && (
            <input
              type="number"
              value={form.priceCents / 100}
              onChange={(e) => updateField("priceCents", Math.round(parseFloat(e.target.value) * 100))}
              placeholder="Prix en €"
              className="h-10 w-full rounded-lg border border-line px-3"
            />
          )}
        </div>
      )}

      {step === 5 && (
        <div>
          <h2 className="font-display text-xl font-bold text-ink">Test (Playground)</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Testez votre contenu après publication depuis la fiche listing avec le mode « Lancer ici ».
          </p>
          <pre className="mt-4 max-h-48 overflow-auto rounded-lg bg-card2 p-4 font-mono text-xs">
            {form.promptBody || "Aucun contenu"}
          </pre>
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
