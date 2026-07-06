import type { Metadata } from "next";
import { Bot, Play, Bug, Plug, Hammer, Gift } from "lucide-react";
import Link from "next/link";
import { B2BSection } from "@/components/marketing/B2BSection";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prompta — Crée ton agent IA sans code, connecté à 800+ apps",
  description:
    "Construis un agent IA en décrivant ton objectif : Gmail, Sheets, Slack, Canva, Notion… Il travaille pour de vrai, tu valides les actions sensibles. Premier agent gratuit + 2 € de crédits IA offerts.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Prompta — tes agents IA en production, sans code",
    description:
      "Décris ton objectif, le copilote construit l'agent. 800+ apps, validation humaine, logs en direct. Gratuit pour démarrer.",
  },
};

export default async function HomePage() {
  return (
    <div className="min-h-screen bg-bg">
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-page px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="font-display text-4xl font-bold tracking-tight text-ink sm:text-6xl">
              Crée, lance et débugge tes{" "}
              <span className="text-accent">agents IA</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-ink-soft">
              Décris ton objectif, le copilote construit l&apos;agent : il lit ton
              Drive, remplit tes Sheets, crée tes visuels Canva, envoie tes emails —
              et s&apos;arrête pour te demander validation avant chaque action
              sensible. Tu suis chaque étape en direct.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/dashboard/new"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-6 text-base font-medium text-white shadow-sm transition-colors hover:bg-accent/90"
              >
                <Bot className="h-5 w-5" />
                Créer mon agent gratuit
              </Link>
              <Link
                href="/pricing"
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-card px-6 text-base font-medium text-ink transition-colors hover:border-accent"
              >
                Voir les tarifs
              </Link>
            </div>

            <p className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/5 px-4 py-1.5 text-sm font-medium text-accent">
              <Gift className="h-4 w-4" />
              1 agent hébergé gratuit · 2 € de crédits IA offerts · sans carte bancaire
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-card2/50">
        <div className="mx-auto max-w-page px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-bold uppercase tracking-wider text-accent">
              Le parcours en 4 temps
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-ink sm:text-3xl">
              Comme Render, mais pour les agents
            </h2>
          </div>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Hammer,
                step: "01",
                title: "Construire",
                desc:
                  "Décris ton objectif : le copilote IA dessine l'arborescence des étapes et te guide nœud par nœud.",
              },
              {
                icon: Plug,
                step: "02",
                title: "Connecter",
                desc:
                  "Gmail, Sheets, Slack, Notion, Canva… Branche un compte en un clic et choisis tes ressources dans une liste, sans copier d'ID.",
              },
              {
                icon: Play,
                step: "03",
                title: "Lancer",
                desc:
                  "Exécution réelle par défaut, ou aperçu à blanc. Étapes, parallélisme et validations humaines intégrées.",
              },
              {
                icon: Bug,
                step: "04",
                title: "Débugger",
                desc:
                  "Console live, logs par étape, erreurs traduites en actions et bouton Arrêter. Tu vois exactement ce qui bloque.",
              },
            ].map((s) => (
              <div
                key={s.step}
                className="relative rounded-2xl border border-line bg-card p-6"
              >
                <span className="font-display text-sm font-bold text-ink-faint">
                  {s.step}
                </span>
                <s.icon className="mt-3 h-9 w-9 text-accent" />
                <h3 className="mt-4 font-display text-lg font-semibold text-ink">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <B2BSection />
    </div>
  );
}
