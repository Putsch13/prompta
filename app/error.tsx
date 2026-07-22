"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";

/** Error boundary global — dans la DA « AI Core », avec relance. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Best-effort : remonter à Sentry si dispo.
    import("@/lib/observability")
      .then((m) => m.captureError?.(error))
      .catch(() => undefined);
  }, [error]);

  return (
    <div className="bg-hud-grid relative flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div aria-hidden className="bg-hud-halo pointer-events-none absolute inset-x-0 top-0 h-full" />
      <div className="relative">
        <Logo size={56} />
        <p className="hud-label mt-8">[ Erreur inattendue ]</p>
        <h1 className="mt-3 font-display text-3xl font-bold text-ink">
          Quelque chose a lâché
        </h1>
        <p className="mx-auto mt-3 max-w-md text-ink-soft">
          Une erreur s&apos;est produite de notre côté. Réessaie — si ça persiste,
          reviens à l&apos;accueil, on garde une trace pour corriger.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            onClick={reset}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-ink shadow-glow-sm transition-all hover:bg-accent-hover hover:shadow-glow"
          >
            Réessayer
          </button>
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-card px-6 text-sm font-medium text-ink transition-all hover:border-accent/50"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
