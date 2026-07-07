"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail, Loader2 } from "lucide-react";

export default function LoginPage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [samlDomain, setSamlDomain] = useState("");

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Navigation COMPLÈTE (pas router.push) : le cookie de session vient
    // d'être posé côté client — le cache du routeur Next servirait encore
    // l'état déconnecté et forçait un refresh manuel pour accéder.
    window.location.assign(redirect);
  }

  async function handleGoogleLogin() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
      },
    });
    if (error) setError(error.message);
  }

  async function handleMicrosoftLogin() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
        scopes: "email openid profile",
      },
    });
    if (error) setError(error.message);
  }

  async function handleSamlLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!samlDomain.trim()) return;
    const { data, error } = await supabase.auth.signInWithSSO({
      domain: samlDomain.trim(),
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
      },
    });
    if (error) {
      setError(error.message);
      return;
    }
    if (data?.url) window.location.href = data.url;
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-[420px] rounded-xl border border-line bg-card p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent">
            <span className="font-display text-xl font-bold text-white">P</span>
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">
            Connexion
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            Connecte-toi pour accéder à ton dashboard
          </p>
        </div>

        <button
          onClick={handleGoogleLogin}
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
          onClick={handleMicrosoftLogin}
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

        <form onSubmit={handleEmailLogin} className="space-y-4">
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
                className="h-10 w-full rounded-lg border border-line bg-card pl-10 pr-4 text-sm text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
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
              className="mt-1.5 h-10 w-full rounded-lg border border-line bg-card px-4 text-sm text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="••••••••"
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
            className="flex h-10 w-full items-center justify-center rounded-lg bg-accent text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Se connecter"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-soft">
          Pas encore de compte ?{" "}
          <Link
            href={`/signup?redirect=${encodeURIComponent(redirect)}`}
            className="font-medium text-accent hover:underline"
          >
            Créer un compte
          </Link>
        </p>

        <details className="mt-6 rounded-lg border border-line bg-card2 p-4">
          <summary className="cursor-pointer text-sm font-medium text-ink-soft">
            Connexion SSO entreprise (SAML)
          </summary>
          <form onSubmit={handleSamlLogin} className="mt-3 space-y-2">
            <input
              type="text"
              value={samlDomain}
              onChange={(e) => setSamlDomain(e.target.value)}
              placeholder="votre-entreprise.com"
              className="h-9 w-full rounded-lg border border-line bg-card px-3 text-sm"
            />
            <button
              type="submit"
              className="w-full rounded-lg border border-line py-2 text-xs font-medium text-ink hover:bg-card"
            >
              Connexion SAML
            </button>
            <p className="text-[11px] text-ink-faint">
              Nécessite la configuration SAML dans Supabase (palier Scale).
            </p>
          </form>
        </details>
      </div>
    </div>
  );
}
