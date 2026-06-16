"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useParams } from "next/navigation";
import { scanForSecrets } from "@/lib/secrets-scanner";
import {
  ArrowLeft,
  Loader2,
  Upload,
  Plus,
  X,
  AlertTriangle,
  Send,
  Play,
} from "lucide-react";
import Link from "next/link";
import { AgentFlowPreview } from "@/components/builder/AgentFlowPreview";
import type { AgentStep } from "@/lib/agent/schema";

interface EnvField {
  key: string;
  description: string;
  required: boolean;
}

export default function EditListingPage() {
  const supabase = createClient();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceCents, setPriceCents] = useState(0);

  // Nouvelle version
  const [promptBody, setPromptBody] = useState("");
  const [changelog, setChangelog] = useState("");
  const [currentSemver, setCurrentSemver] = useState("v1.0");

  // Environnement
  const [envFields, setEnvFields] = useState<EnvField[]>([]);
  const [dependencies, setDependencies] = useState("");
  const [setupTime, setSetupTime] = useState("");

  // Bundle
  const [bundleFile, setBundleFile] = useState<File | null>(null);
  const [bundleSecretWarning, setBundleSecretWarning] = useState<string[]>([]);

  const [listingStatus, setListingStatus] = useState("draft");
  const [listingSlug, setListingSlug] = useState<string | null>(null);

  // Agent : arborescence dédiée (steps du manifeste). On conserve le manifeste
  // complet pour le réattacher tel quel à la sauvegarde (ne rien perdre).
  const [agentSteps, setAgentSteps] = useState<AgentStep[] | null>(null);
  const [agentManifest, setAgentManifest] = useState<Record<string, unknown> | null>(null);
  const [provisioningMode, setProvisioningMode] = useState<string>("manual");

  useEffect(() => {
    async function load() {
      const { data: listing } = await supabase
        .from("listings")
        .select("title, description, price_cents, status, slug, current_version_id")
        .eq("id", id)
        .single();

      if (!listing) {
        router.push("/dashboard");
        return;
      }

      setTitle(listing.title);
      setDescription(listing.description || "");
      setPriceCents(listing.price_cents ?? 0);
      setListingStatus(listing.status ?? "draft");
      setListingSlug(listing.slug ?? null);

      if (listing.current_version_id) {
        const { data: version } = await supabase
          .from("listing_versions")
          .select("semver, prompt_body, env")
          .eq("id", listing.current_version_id)
          .single();

        if (version) {
          setPromptBody(version.prompt_body || "");
          setCurrentSemver(version.semver);

          const env = version.env as {
            fields?: EnvField[];
            dependencies?: string;
            setup_time?: string;
            manifest?: { steps?: AgentStep[]; provisioning_mode?: string };
          } | null;
          if (env?.fields) setEnvFields(env.fields);
          if (env?.dependencies) setDependencies(env.dependencies);
          if (env?.setup_time) setSetupTime(env.setup_time);

          const steps = env?.manifest?.steps;
          if (Array.isArray(steps) && steps.length > 0) {
            setAgentSteps(steps);
            setAgentManifest(env!.manifest as Record<string, unknown>);
            if (env?.manifest?.provisioning_mode) {
              setProvisioningMode(env.manifest.provisioning_mode);
            }
          }
        }
      }

      setLoading(false);
    }
    load();
  }, [supabase, id, router]);

  function bumpVersion(semver: string): string {
    const match = semver.match(/v?(\d+)\.(\d+)/);
    if (!match) return "v1.1";
    return `v${match[1]}.${parseInt(match[2]) + 1}`;
  }

  function addEnvField() {
    setEnvFields([...envFields, { key: "", description: "", required: true }]);
  }

  async function handleBundleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBundleFile(file);

    if (file.name.endsWith(".txt") || file.name.endsWith(".md") || file.name.endsWith(".env")) {
      const text = await file.text();
      setBundleSecretWarning(scanForSecrets(text));
    } else {
      setBundleSecretWarning([]);
    }
  }

  async function handleSave(publish: boolean) {
    setError(null);

    if (bundleSecretWarning.length > 0) {
      setError("Clés secrètes détectées dans le fichier uploadé.");
      return;
    }

    if (publish) {
      setPublishing(true);
    } else {
      setSaving(true);
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Mettre à jour le listing
    await supabase
      .from("listings")
      .update({
        title,
        description,
        price_cents: priceCents,
        ...(publish ? { status: "under_review" as const } : {}),
      })
      .eq("id", id);

    // Créer une nouvelle version
    const newSemver = bumpVersion(currentSemver);

    let bundlePath: string | null = null;
    if (bundleFile) {
      const path = `bundles/${id}/${newSemver}/${bundleFile.name}`;
      await supabase.storage.from("bundles").upload(path, bundleFile);
      bundlePath = path;
    }

    const { data: version } = await supabase
      .from("listing_versions")
      .insert({
        listing_id: id,
        semver: newSemver,
        prompt_body: promptBody || null,
        changelog: changelog || null,
        env: JSON.parse(JSON.stringify({
          fields: envFields,
          dependencies: dependencies || null,
          setup_time: setupTime || null,
          // Préserve le manifeste complet de l'agent : sans lui, l'agent ne tournerait plus.
          ...(agentManifest ? { manifest: agentManifest } : {}),
        })),
        bundle_path: bundlePath,
      })
      .select("id")
      .single();

    if (version) {
      await supabase
        .from("listings")
        .update({ current_version_id: version.id })
        .eq("id", id);
    }

    setSaving(false);
    setPublishing(false);
    router.push("/dashboard");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour au dashboard
      </Link>

      <h1 className="text-2xl font-bold">Modifier : {title}</h1>
      <p className="mt-1 text-sm text-muted">
        Les modifications créent une <strong>nouvelle version</strong> (jamais
        d&apos;écrasement).
      </p>

      {agentSteps && (
        <div className="mt-6">
          <AgentFlowPreview steps={agentSteps} provisioningMode={provisioningMode} />
          {listingSlug && (
            <Link
              href={`/listing/${listingSlug}?run=1`}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              <Play className="h-4 w-4" /> Lancer / tester l&apos;agent
            </Link>
          )}
          <p className="mt-2 text-xs text-muted">
            Le détail des étapes se modifie dans le builder. Ici, ajustez les
            métadonnées (titre, description, prix) et l&apos;environnement.
          </p>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSave(false);
        }}
        className="mt-8 space-y-6"
      >
        {/* Titre */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium">Titre</label>
          <input
            id="title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-4 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium">Description</label>
          <textarea
            id="description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-card px-4 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 resize-none"
          />
        </div>

        {/* Contenu du prompt (uniquement pour les prompts, pas les agents) */}
        {!agentSteps && (
          <div>
            <label htmlFor="promptBody" className="block text-sm font-medium">
              Contenu du prompt
            </label>
            <textarea
              id="promptBody"
              rows={8}
              value={promptBody}
              onChange={(e) => setPromptBody(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-card px-4 py-3 font-mono text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 resize-y"
            />
          </div>
        )}

        {/* Prix */}
        <div>
          <label htmlFor="price" className="block text-sm font-medium">Prix (EUR)</label>
          <input
            id="price"
            type="number"
            min={0}
            step={0.01}
            value={priceCents / 100}
            onChange={(e) => setPriceCents(Math.round(parseFloat(e.target.value || "0") * 100))}
            className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-4 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>

        {/* Changelog */}
        <div>
          <label htmlFor="changelog" className="block text-sm font-medium">
            Changelog (v{bumpVersion(currentSemver).replace("v", "")})
          </label>
          <textarea
            id="changelog"
            rows={3}
            value={changelog}
            onChange={(e) => setChangelog(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-card px-4 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 resize-none"
            placeholder="Qu'est-ce qui a changé dans cette version ?"
          />
        </div>

        {/* Environnement */}
        <div className="border-t border-border pt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Environnement</h2>
            <button type="button" onClick={addEnvField} className="flex items-center gap-1 text-xs font-medium text-accent hover:underline">
              <Plus className="h-3.5 w-3.5" /> Ajouter une variable
            </button>
          </div>
          {envFields.map((field, i) => (
            <div key={i} className="mt-3 flex gap-2">
              <input type="text" placeholder="CLÉ" value={field.key} onChange={(e) => {
                const updated = [...envFields];
                updated[i] = { ...field, key: e.target.value.toUpperCase() };
                setEnvFields(updated);
              }} className="h-10 w-36 rounded-lg border border-border bg-card px-3 font-mono text-xs outline-none focus:border-accent" />
              <input type="text" placeholder="Description" value={field.description} onChange={(e) => {
                const updated = [...envFields];
                updated[i] = { ...field, description: e.target.value };
                setEnvFields(updated);
              }} className="h-10 flex-1 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent" />
              <button type="button" onClick={() => setEnvFields(envFields.filter((_, j) => j !== i))} className="text-muted hover:text-destructive">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Dépendances</label>
              <input type="text" value={dependencies} onChange={(e) => setDependencies(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-sm font-medium">Temps de setup</label>
              <input type="text" value={setupTime} onChange={(e) => setSetupTime(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent" />
            </div>
          </div>
        </div>

        {/* Bundle upload */}
        <div>
          <label className="mt-3 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-border p-6 transition-colors hover:border-accent">
            <Upload className="h-6 w-6 text-muted" />
            <span className="mt-1 text-sm">{bundleFile ? bundleFile.name : "Nouveau bundle .zip (optionnel)"}</span>
            <input type="file" accept=".zip,.txt,.md" onChange={handleBundleChange} className="hidden" />
          </label>
          {bundleSecretWarning.length > 0 && (
            <div className="mt-2 rounded-lg bg-warning/10 p-3 text-sm text-warning">
              <AlertTriangle className="mr-1 inline h-4 w-4" />
              Clés secrètes détectées — supprime-les avant de soumettre.
            </div>
          )}
        </div>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex h-11 flex-1 items-center justify-center rounded-lg border border-border text-sm font-medium transition-colors hover:bg-accent-light disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer le brouillon"}
          </button>

          {(listingStatus === "draft" || listingStatus === "rejected") && (
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={publishing}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {publishing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Soumettre pour review
                </>
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
