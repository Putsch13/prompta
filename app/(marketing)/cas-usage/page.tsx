import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Zap } from "lucide-react";
import { USE_CASES_SEO } from "@/lib/marketing/use-cases-seo";

export const metadata: Metadata = {
  title: "Cas d'usage — ce que Prompta fait pour toi",
  description:
    "Résumer des pages, extraire des données vers Sheets, automatiser Gmail, comparer des devis, piloter ton CRM, faire ta veille : les cas d'usage concrets de l'assistant IA Prompta.",
  alternates: { canonical: "/cas-usage" },
};

export default function UseCasesIndexPage() {
  return (
    <div className="min-h-screen bg-bg">
      <section className="bg-hud-grid relative overflow-hidden border-b border-line">
        <div aria-hidden className="bg-hud-halo pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-page px-4 py-16 sm:px-6 lg:px-8">
          <p className="hud-label">[ Cas d&apos;usage ]</p>
          <h1 className="mt-4 max-w-2xl font-display text-4xl font-bold tracking-tight text-ink">
            Ce que les gens font vraiment avec Prompta
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-soft">
            Des exemples concrets, avec l&apos;ordre exact à donner. Chaque cas
            fonctionne dès l&apos;installation — gratuit pour démarrer, 2 € de
            crédits IA offerts.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-page px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {USE_CASES_SEO.map((u) => (
            <Link key={u.slug} href={`/cas-usage/${u.slug}`} className="hud-card group flex flex-col p-6">
              <p className="hud-label !text-ink-faint">{u.kicker}</p>
              <h2 className="mt-3 font-display text-lg font-semibold leading-snug text-ink group-hover:text-accent">
                {u.h1}
              </h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">
                {u.metaDescription}
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent">
                Voir le cas d&apos;usage <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-14 text-center">
          <Link
            href="/prompta-partout"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-8 text-base font-semibold text-accent-ink shadow-glow transition-all hover:bg-accent-hover hover:shadow-glow-lg"
          >
            <Zap className="h-5 w-5" /> Installer Prompta partout
          </Link>
        </div>
      </section>
    </div>
  );
}
