"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Check, AlertTriangle } from "lucide-react";

export default function EditProfilePage() {
  const supabase = createClient();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");
  const [location, setLocation] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("username, display_name, headline, location, avatar_url")
        .eq("id", user.id)
        .single();

      if (profile) {
        setUsername(profile.username);
        setDisplayName(profile.display_name);
        setHeadline(profile.headline || "");
        setLocation(profile.location || "");
        setAvatarUrl(profile.avatar_url);
        if (profile.avatar_url) setAvatarPreview(profile.avatar_url);
      }
      setLoading(false);
    }
    load();
  }, [supabase, router]);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    setSaved(false);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let newAvatarUrl = avatarUrl;

    if (avatarFile) {
      const ext = avatarFile.name.split(".").pop();
      const path = `avatars/${user.id}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, { upsert: true });

      if (!uploadError) {
        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        newAvatarUrl = data.publicUrl;
      }
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        username,
        display_name: displayName,
        headline: headline || null,
        location: location || null,
        avatar_url: newAvatarUrl,
      })
      .eq("id", user.id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword !== confirmPassword) {
      setPasswordMsg("Les mots de passe ne correspondent pas.");
      return;
    }
    setPasswordSaving(true);
    const res = await fetch("/api/account/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    setPasswordSaving(false);
    if (!res.ok) {
      setPasswordMsg(data.error ?? "Erreur");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordMsg("Mot de passe mis à jour.");
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeleteError(null);
    setDeleting(true);
    const res = await fetch("/api/account/delete-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: deleteConfirm, password: deletePassword }),
    });
    const data = await res.json();
    setDeleting(false);
    if (!res.ok) {
      setDeleteError(data.error ?? "Suppression échouée");
      return;
    }
    router.push("/");
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
    <div className="max-w-xl">
      <h1 className="font-display text-2xl font-bold text-ink">
        Modifier mon profil
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Ces informations sont visibles sur ton profil public
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div className="flex items-center gap-4">
          <label className="group relative cursor-pointer">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-line bg-card transition-colors group-hover:border-accent">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" className="h-full w-full object-cover" /> // eslint-disable-line @next/next/no-img-element
              ) : (
                <span className="text-xl text-ink-faint">+</span>
              )}
            </div>
            <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
          </label>
          <div>
            <p className="text-sm font-medium text-ink">Photo de profil</p>
            <p className="text-xs text-ink-soft">JPG, PNG. 1 Mo max.</p>
          </div>
        </div>

        <div>
          <label htmlFor="username" className="block text-[11px] font-bold uppercase tracking-wide text-ink-soft">
            Nom d&apos;utilisateur
          </label>
          <input
            id="username"
            type="text"
            required
            minLength={3}
            maxLength={30}
            value={username}
            onChange={(e) =>
              setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
            }
            className="mt-1.5 h-10 w-full rounded-lg border border-line bg-card px-4 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>

        <div>
          <label htmlFor="displayName" className="block text-[11px] font-bold uppercase tracking-wide text-ink-soft">
            Nom affiché
          </label>
          <input
            id="displayName"
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1.5 h-10 w-full rounded-lg border border-line bg-card px-4 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>

        <div>
          <label htmlFor="headline" className="block text-[11px] font-bold uppercase tracking-wide text-ink-soft">
            Titre / Spécialité
          </label>
          <input
            id="headline"
            type="text"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            className="mt-1.5 h-10 w-full rounded-lg border border-line bg-card px-4 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            placeholder="Expert en prompts de copywriting IA"
          />
        </div>

        <div>
          <label htmlFor="location" className="block text-[11px] font-bold uppercase tracking-wide text-ink-soft">
            Localisation
          </label>
          <input
            id="location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1.5 h-10 w-full rounded-lg border border-line bg-card px-4 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            placeholder="Paris, France"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-accent-ink shadow-glow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <>
              <Check className="h-4 w-4" />
              Enregistré
            </>
          ) : (
            "Enregistrer"
          )}
        </button>
      </form>

      <section className="mt-12 border-t border-line pt-10">
        <h2 className="font-display text-lg font-bold text-ink">Sécurité du compte</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Mot de passe, connexions apps, suppression du compte.
        </p>
        <Link
          href="/dashboard/connexions"
          className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
        >
          Gérer mes connexions →
        </Link>

        <form onSubmit={handleChangePassword} className="mt-6 space-y-4 rounded-xl border border-line bg-card p-5">
          <h3 className="text-sm font-semibold text-ink">Changer le mot de passe</h3>
          <input
            type="password"
            placeholder="Mot de passe actuel"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="h-10 w-full rounded-lg border border-line px-3 text-sm"
          />
          <input
            type="password"
            placeholder="Nouveau mot de passe (min. 8 caractères)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
            className="h-10 w-full rounded-lg border border-line px-3 text-sm"
          />
          <input
            type="password"
            placeholder="Confirmer le nouveau mot de passe"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={8}
            required
            className="h-10 w-full rounded-lg border border-line px-3 text-sm"
          />
          {passwordMsg && (
            <p className={`text-sm ${passwordMsg.includes("mis à jour") ? "text-success" : "text-destructive"}`}>
              {passwordMsg}
            </p>
          )}
          <button
            type="submit"
            disabled={passwordSaving}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-bg disabled:opacity-50"
          >
            {passwordSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Mettre à jour le mot de passe"}
          </button>
        </form>

        <form
          onSubmit={handleDeleteAccount}
          className="mt-6 space-y-4 rounded-xl border border-destructive/30 bg-destructive/5 p-5"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <h3 className="text-sm font-semibold text-destructive">Supprimer mon compte</h3>
              <p className="mt-1 text-xs text-ink-soft">
                Action irréversible — profil, documents, clés et historique seront effacés.
              </p>
            </div>
          </div>
          <input
            type="password"
            placeholder="Mot de passe (confirmation)"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm"
          />
          <input
            type="text"
            placeholder='Tapez SUPPRIMER pour confirmer'
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm"
          />
          {deleteError && (
            <p className="text-sm text-destructive">{deleteError}</p>
          )}
          <button
            type="submit"
            disabled={deleting || deleteConfirm !== "SUPPRIMER"}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-destructive/90 px-4 text-sm font-semibold text-[#1a0505] hover:bg-destructive disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Supprimer définitivement"}
          </button>
        </form>
      </section>
    </div>
  );
}
