import type { Metadata } from "next";
import Link from "next/link";
import { USE_CASES } from "@/lib/marketing/use-cases";

export const metadata: Metadata = {
  title: "Cas d'usage — 13 agents IA prêts à construire | Prompta",
  description:
    "Veille, reporting, relances clients, LinkedIn, comptes rendus Notion, rapport Stripe… 13 agents IA concrets à construire en 3 minutes, sans code.",
};

/** Index des cas d'usage — chaque carte mène à la page dédiée. */
export default function CasUsageIndexPage() {
  const entries = Object.entries(USE_CASES);

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-accent">Cas d&apos;usage</p>
      <h1 className="mt-1 font-display text-4xl font-bold leading-tight text-ink">
        Qu&apos;est-ce que ton agent va faire pour toi ?
      </h1>
      <p className="mt-3 max-w-2xl text-lg text-ink-soft">
        {entries.length} missions concrètes, du quotidien réel — chacune se construit en 3 minutes,
        l&apos;objectif est prérempli. Ton cas n&apos;y est pas ? Décris-le au copilote, il
        construit l&apos;agent quand même.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map(([slug, uc]) => (
          <Link
            key={slug}
            href={`/cas-usage/${slug}`}
            className="group flex flex-col rounded-2xl border border-line bg-card p-5 transition-all hover:border-accent/40 hover:shadow-md"
          >
            <span className="text-2xl">{uc.emoji}</span>
            <h2 className="mt-3 font-display font-semibold leading-snug text-ink group-hover:text-accent">
              {uc.title}
            </h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">{uc.teaser}</p>
            <p className="mt-3 text-xs text-ink-faint">{uc.apps.slice(0, 3).join(" · ")}</p>
            <span className="mt-3 text-sm font-medium text-accent">Voir l&apos;agent →</span>
          </Link>
        ))}
      </div>

      <div className="mt-14 rounded-2xl border border-accent/30 bg-accent/5 p-8 text-center">
        <p className="font-display text-lg font-semibold text-ink">
          Un besoin qui ne rentre dans aucune case ?
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          Décris-le en une phrase — le copilote construit l&apos;agent avec toi, quel que soit le cas.
        </p>
        <Link
          href="/dashboard/new"
          className="mt-4 inline-flex rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
        >
          Créer mon agent sur mesure
        </Link>
      </div>
    </div>
  );
}
