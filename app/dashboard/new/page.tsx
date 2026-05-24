"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { scanForSecrets } from "@/lib/secrets-scanner";
import {
  Loader2,
  Upload,
  Plus,
  X,
  AlertTriangle,
} from "lucide-react";

type ListingType = "prompt" | "agent" | "workflow";

interface EnvField {
  key: string;
  description: string;
  required: boolean;
}

export default function NewListingPage() {
  const supabase = createClient();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [type, setType] = useState<ListingType>("prompt");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [modelInput, setModelInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [priceCents, setPriceCents] = useState(0);
  const [promptBody, setPromptBody] = useState("");

  // Environnement
  const [envFields, setEnvFields] = useState<EnvField[]>([]);
  const [dependencies, setDependencies] = useState("");
  const [setupTime, setSetupTime] = useState("");

  // Bundle
  const [bundleFile, setBundleFile] = useState<File | null>(null);
  const [bundleSecretWarning, setBundleSecretWarning] = useState<string[]>([]);

  // Catégories
  const [categories, setCategories] = useState<
    { id: string; name: string; slug: string }[]
  >([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("categories")
      .select("id, name, slug")
      .order("name")
      .then(({ data }) => {
        if (data) setCategories(data);
      });
  }, [supabase]);

  function addModel() {
    const v = modelInput.trim();
    if (v && !models.includes(v)) {
      setModels([...models, v]);
      setModelInput("");
    }
  }

  function addTag() {
    const v = tagInput.trim().toLowerCase();
    if (v && !tags.includes(v)) {
      setTags([...tags, v]);
      setTagInput("");
    }
  }

  function addEnvField() {
    setEnvFields([...envFields, { key: "", description: "", required: true }]);
  }

  function updateEnvField(index: number, field: Partial<EnvField>) {
    setEnvFields(
      envFields.map((f, i) => (i === index ? { ...f, ...field } : f))
    );
  }

  function removeEnvField(index: number) {
    setEnvFields(envFields.filter((_, i) => i !== index));
  }

  async function handleBundleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBundleFile(file);

    if (file.name.endsWith(".txt") || file.name.endsWith(".md") || file.name.endsWith(".env")) {
      const text = await file.text();
      const secrets = scanForSecrets(text);
      setBundleSecretWarning(secrets);
    } else {
      setBundleSecretWarning([]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (bundleSecretWarning.length > 0) {
      setError(
        "Le fichier uploadé semble contenir des clés secrètes. Supprime-les avant de soumettre."
      );
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/listings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          type,
          categoryId: categoryId || null,
          description,
          models,
          tags,
          priceCents,
          promptBody,
          envFields,
          dependencies,
          setupTime,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de la création");
        setSaving(false);
        return;
      }

      const listingId = data.id;
      const versionId = data.versionId;

      if (bundleFile) {
        const path = `bundles/${listingId}/v1.0/${bundleFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("bundles")
          .upload(path, bundleFile);

        if (uploadError) {
          setError(`Upload échoué : ${uploadError.message}`);
          setSaving(false);
          return;
        }

        await supabase
          .from("listing_versions")
          .update({ bundle_path: path })
          .eq("id", versionId);
      }

      if (data.flagged) {
        setError(
          `Contenu signalé pour revue manuelle (${data.flags.join(", ")}). Il sera examiné par notre équipe.`
        );
      }

      setSaving(false);
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Une erreur est survenue");
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-bold text-ink">
        Nouveau prompt / agent
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Remplis les informations ci-dessous. Tu pourras publier ou sauvegarder
        en brouillon.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-ink-soft">
            Type
          </label>
          <div className="mt-2 flex gap-3">
            {(["prompt", "agent", "workflow"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  type === t
                    ? "border-accent bg-accent text-white"
                    : "border-line text-ink hover:border-accent"
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Titre */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium">
            Titre
          </label>
          <input
            id="title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-line bg-card px-4 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            placeholder="Cold email B2B optimisé GPT-4"
          />
        </div>

        {/* Catégorie */}
        <div>
          <label htmlFor="category" className="block text-sm font-medium">
            Catégorie
          </label>
          <select
            id="category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-line bg-card px-4 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            <option value="">Aucune</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium">
            Description
          </label>
          <textarea
            id="description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-card px-4 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 resize-none"
            placeholder="Décris ton prompt, à qui il s'adresse, ce qu'il fait..."
          />
        </div>

        {/* Contenu du prompt */}
        <div>
          <label htmlFor="promptBody" className="block text-sm font-medium">
            Contenu du prompt
          </label>
          <p className="mt-0.5 text-xs text-ink-soft">
            Le texte complet sera visible uniquement après achat (si payant)
          </p>
          <textarea
            id="promptBody"
            rows={8}
            value={promptBody}
            onChange={(e) => setPromptBody(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-card px-4 py-3 font-mono text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 resize-y"
            placeholder="Tu es un expert en..."
          />
        </div>

        {/* Modèles compatibles */}
        <div>
          <label className="block text-sm font-medium">
            Modèles compatibles
          </label>
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addModel())}
              className="h-10 flex-1 rounded-lg border border-line bg-card px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="GPT-4, Claude 3.5, etc."
            />
            <button
              type="button"
              onClick={addModel}
              className="flex h-10 items-center gap-1 rounded-lg border border-line px-3 text-sm hover:bg-accent-light"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          {models.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {models.map((m) => (
                <span
                  key={m}
                  className="flex items-center gap-1 rounded-full bg-accent-light px-3 py-1 text-xs font-medium text-accent"
                >
                  {m}
                  <button
                    type="button"
                    onClick={() => setModels(models.filter((x) => x !== m))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium">Tags</label>
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
              className="h-10 flex-1 rounded-lg border border-line bg-card px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="copywriting, b2b, cold-email..."
            />
            <button
              type="button"
              onClick={addTag}
              className="flex h-10 items-center gap-1 rounded-lg border border-line px-3 text-sm hover:bg-accent-light"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {tags.map((t) => (
                <span
                  key={t}
                  className="flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium"
                >
                  #{t}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Prix */}
        <div>
          <label htmlFor="price" className="block text-sm font-medium">
            Prix (EUR)
          </label>
          <div className="relative mt-1">
            <input
              id="price"
              type="number"
              min={0}
              step={0.01}
              value={priceCents / 100}
              onChange={(e) =>
                setPriceCents(Math.round(parseFloat(e.target.value || "0") * 100))
              }
              className="h-11 w-full rounded-lg border border-line bg-card px-4 pr-12 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-ink-soft">
              EUR
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            0 = gratuit. Commission Prompta : 20%.
          </p>
        </div>

        {/* Séparateur environnement */}
        <div className="border-t border-line pt-6">
          <h2 className="text-lg font-semibold">Environnement</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Indique les clés API, variables et dépendances nécessaires pour
            utiliser ce prompt/agent.
          </p>
        </div>

        {/* Clés API / Variables */}
        <div>
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">
              Clés API & variables requises
            </label>
            <button
              type="button"
              onClick={addEnvField}
              className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter
            </button>
          </div>
          {envFields.length > 0 && (
            <div className="mt-3 space-y-3">
              {envFields.map((field, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="OPENAI_API_KEY"
                    value={field.key}
                    onChange={(e) =>
                      updateEnvField(i, { key: e.target.value.toUpperCase() })
                    }
                    className="h-10 w-40 shrink-0 rounded-lg border border-line bg-card px-3 font-mono text-xs outline-none focus:border-accent"
                  />
                  <input
                    type="text"
                    placeholder="Description"
                    value={field.description}
                    onChange={(e) =>
                      updateEnvField(i, { description: e.target.value })
                    }
                    className="h-10 flex-1 rounded-lg border border-line bg-card px-3 text-sm outline-none focus:border-accent"
                  />
                  <label className="flex items-center gap-1 text-xs text-ink-soft">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) =>
                        updateEnvField(i, { required: e.target.checked })
                      }
                      className="rounded"
                    />
                    Requis
                  </label>
                  <button
                    type="button"
                    onClick={() => removeEnvField(i)}
                    className="text-ink-soft hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dépendances */}
        <div>
          <label htmlFor="deps" className="block text-sm font-medium">
            Dépendances
          </label>
          <input
            id="deps"
            type="text"
            value={dependencies}
            onChange={(e) => setDependencies(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-line bg-card px-4 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            placeholder="Python 3.11, langchain, etc."
          />
        </div>

        {/* Temps de setup */}
        <div>
          <label htmlFor="setup" className="block text-sm font-medium">
            Temps de setup estimé
          </label>
          <input
            id="setup"
            type="text"
            value={setupTime}
            onChange={(e) => setSetupTime(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-line bg-card px-4 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            placeholder="5 min"
          />
        </div>

        {/* Upload bundle */}
        <div className="border-t border-line pt-6">
          <h2 className="text-lg font-semibold">Bundle</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Uploade un fichier .zip contenant le prompt, .env.example, guide de
            démarrage.
          </p>
          <label className="mt-3 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-line p-8 transition-colors hover:border-accent hover:bg-accent-light/30">
            <Upload className="h-8 w-8 text-ink-soft" />
            <span className="mt-2 text-sm font-medium">
              {bundleFile ? bundleFile.name : "Choisir un fichier .zip"}
            </span>
            <span className="mt-1 text-xs text-ink-soft">
              ZIP, max 50 Mo
            </span>
            <input
              type="file"
              accept=".zip,.txt,.md"
              onChange={handleBundleChange}
              className="hidden"
            />
          </label>

          {bundleSecretWarning.length > 0 && (
            <div className="mt-3 rounded-lg bg-warning/10 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-warning">
                <AlertTriangle className="h-4 w-4" />
                Clés secrètes détectées
              </div>
              <ul className="mt-1 space-y-1 text-xs text-warning">
                {bundleSecretWarning.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Erreur */}
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving || !title}
            className="flex h-11 flex-1 items-center justify-center rounded-lg bg-accent text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Enregistrer en brouillon"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
