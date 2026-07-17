import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="bg-hud-grid relative flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div aria-hidden className="bg-hud-halo pointer-events-none absolute inset-x-0 top-0 h-full" />
      <div className="relative">
        <Logo size={56} />
        <p className="hud-label mt-8">[ Erreur 404 ]</p>
        <h1 className="mt-3 font-display text-3xl font-bold text-ink">
          Cette page n&apos;existe pas
        </h1>
        <p className="mx-auto mt-3 max-w-md text-ink-soft">
          Le lien est peut-être périmé — le produit évolue vite. Tout ce qui
          compte est accessible depuis l&apos;accueil.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-ink shadow-glow-sm transition-all hover:bg-accent-hover hover:shadow-glow"
          >
            Retour à l&apos;accueil
          </Link>
          <Link
            href="/dashboard/runs"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-card px-6 text-sm font-medium text-ink transition-all hover:border-accent/50"
          >
            Mon dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
