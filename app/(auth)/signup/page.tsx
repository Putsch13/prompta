"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail, Loader2, CheckCircle } from "lucide-react";

export default function SignupPage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/onboarding";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?redirect=${encodeURIComponent(redirect)}`,
      },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setConfirmSent(true);
  }

  async function handleGoogleSignup() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent("/onboarding")}`,
      },
    });
    if (error) setError(error.message);
  }

  async function handleMicrosoftSignup() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent("/onboarding")}`,
        scopes: "email openid profile",
      },
    });
    if (error) setError(error.message);
  }

  if (confirmSent) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-bg bg-hud-grid px-4 py-12">
        <div className="hud-corners w-full max-w-[420px] rounded-xl border border-line bg-card p-8 text-center shadow-sm">
          <CheckCircle className="mx-auto h-12 w-12 text-success" />
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">
            Vérifie ta boîte mail
          </h1>
          <p className="mt-3 text-sm text-ink-soft">
            Un email de confirmation a été envoyé à{" "}
            <span className="font-medium text-ink">{email}</span>. Clique sur le
            lien pour activer ton compte.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-bg bg-hud-grid px-4 py-12">
      <div className="hud-corners w-full max-w-[420px] rounded-xl border border-line bg-card p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent shadow-glow-sm">
            <span className="font-display text-xl font-bold text-accent-ink">P</span>
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">
            Créer un compte
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            Rejoins la communauté des builders IA
          </p>
        </div>

        <button
          onClick={handleGoogleSignup}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-line bg-card px-4 py-3 text-sm font-medium text-ink transition-colors hover:bg-card2"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continuer avec Google
        </button>

        <button
          onClick={handleMicrosoftSignup}
          className="mt-3 flex w-full items-center justify-center gap-3 rounded-lg border border-line bg-card px-4 py-3 text-sm font-medium text-ink transition-colors hover:bg-card2"
        >
          <svg className="h-5 w-5" viewBox="0 0 23 23">
            <path fill="#f25022" d="M1 1h10v10H1z" />
            <path fill="#00a4ef" d="M12 1h10v10H12z" />
            <path fill="#7fba00" d="M1 12h10v10H1z" />
            <path fill="#ffb900" d="M12 12h10v10H12z" />
          </svg>
          Continuer avec Microsoft
        </button>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-line" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-ink-faint">ou</span>
          </div>
        </div>

        <form onSubmit={handleEmailSignup} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-[11px] font-bold uppercase tracking-wide text-ink-soft"
            >
              Email
            </label>
            <div className="relative mt-1.5">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 w-full rounded-lg border border-line bg-card2 pl-10 pr-4 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60 focus:ring-1 focus:ring-accent/40"
                placeholder="ton@email.com"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-[11px] font-bold uppercase tracking-wide text-ink-soft"
            >
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-line bg-card2 px-4 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60 focus:ring-1 focus:ring-accent/40"
              placeholder="6 caractères minimum"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex h-10 w-full items-center justify-center rounded-lg bg-accent text-sm font-semibold text-accent-ink shadow-glow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Créer mon compte"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-soft">
          Déjà un compte ?{" "}
          <Link
            href="/login"
            className="font-medium text-accent hover:underline"
          >
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
