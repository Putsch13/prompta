"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Loader2, Check, X } from "lucide-react";

export default function OnboardingPage() {
  const supabase = createClient();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(
    null
  );
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profile) {
        setUsername(profile.username);
        setDisplayName(profile.display_name);
        setHeadline(profile.headline || "");
        if (profile.avatar_url) setAvatarPreview(profile.avatar_url);
      }
    }
    loadUser();
  }, [supabase, router]);

  useEffect(() => {
    if (username.length < 3) {
      setUsernameAvailable(null);
      return;
    }

    const timeout = setTimeout(async () => {
      setCheckingUsername(true);
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();

      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUsernameAvailable(data === null || data.id === user?.id);
      setCheckingUsername(false);
    }, 400);

    return () => clearTimeout(timeout);
  }, [username, supabase]);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!usernameAvailable) {
      setError("Ce nom d'utilisateur n'est pas disponible.");
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    let avatarUrl: string | undefined;

    if (avatarFile) {
      const ext = avatarFile.name.split(".").pop();
      const path = `avatars/${user.id}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, { upsert: true });

      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from("avatars")
          .getPublicUrl(path);
        avatarUrl = urlData.publicUrl;
      }
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        username,
        display_name: displayName,
        headline: headline || null,
        ...(avatarUrl && { avatar_url: avatarUrl }),
      })
      .eq("id", user.id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push("/quick");
    router.refresh();
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-bg bg-hud-grid px-4 py-12">
      <div className="hud-corners w-full max-w-[420px] rounded-xl border border-line bg-card p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent shadow-glow-sm">
            <span className="font-display text-xl font-bold text-accent-ink">P</span>
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">
            Complète ton profil
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            Ensuite : connecte tes apps et donne un ordre à l&apos;assistant
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex justify-center">
            <label className="group relative cursor-pointer">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-line bg-card2 transition-colors group-hover:border-accent">
                {avatarPreview ? (
                  <img // eslint-disable-line @next/next/no-img-element
                    src={avatarPreview}
                    alt="Avatar"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-2xl text-ink-faint">+</span>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </label>
          </div>

          <div>
            <label
              htmlFor="username"
              className="block text-[11px] font-bold uppercase tracking-wide text-ink-soft"
            >
              Nom d&apos;utilisateur
            </label>
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-faint">
                @
              </span>
              <input
                id="username"
                type="text"
                required
                minLength={3}
                maxLength={30}
                pattern="[a-z0-9_]+"
                value={username}
                onChange={(e) =>
                  setUsername(
                    e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")
                  )
                }
                className="h-10 w-full rounded-lg border border-line bg-card2 pl-8 pr-10 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60 focus:ring-1 focus:ring-accent/40"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {checkingUsername && (
                  <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />
                )}
                {!checkingUsername && usernameAvailable === true && (
                  <Check className="h-4 w-4 text-success" />
                )}
                {!checkingUsername && usernameAvailable === false && (
                  <X className="h-4 w-4 text-destructive" />
                )}
              </div>
            </div>
            <p className="mt-1 text-xs text-ink-faint">
              Lettres minuscules, chiffres et underscores uniquement
            </p>
          </div>

          <div>
            <label
              htmlFor="displayName"
              className="block text-[11px] font-bold uppercase tracking-wide text-ink-soft"
            >
              Nom affiché
            </label>
            <input
              id="displayName"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-line bg-card2 px-4 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60 focus:ring-1 focus:ring-accent/40"
              placeholder="Jean Dupont"
            />
          </div>

          <div>
            <label
              htmlFor="headline"
              className="block text-[11px] font-bold uppercase tracking-wide text-ink-soft"
            >
              Titre / Spécialité
            </label>
            <input
              id="headline"
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-line bg-card2 px-4 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60 focus:ring-1 focus:ring-accent/40"
              placeholder="Expert en prompts de copywriting IA"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || usernameAvailable === false}
            className="flex h-10 w-full items-center justify-center rounded-lg bg-accent text-sm font-semibold text-accent-ink shadow-glow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Enregistrer et continuer"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
