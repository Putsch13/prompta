import { Bot, Play, Bug, Plug, Hammer } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { B2BSection } from "@/components/marketing/B2BSection";

export const dynamic = "force-dynamic";

const CATEGORY_ICONS: Record<string, string> = {
  copywriting: "✏️",
  code: "💻",
  marketing: "📣",
  sales: "📈",
  data: "📊",
  design: "🎨",
  hr: "👥",
  support: "🎧",
  productivity: "⚡",
  education: "📚",
};

export default async function HomePage() {
  const supabase = await createClient();

  const { data: categories } = await supabase
    .from("categories")
    .select("slug, name, icon")
    .order("name")
    .limit(8);

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
              La plateforme la plus simple pour construire des agents IA, les
              connecter à tes outils (Gmail, Sheets, Slack…), les faire tourner
              et les débugger — tout au même endroit. Comme Render, mais pour les
              agents. Abonnement par agent en production.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/dashboard/new"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-6 text-base font-medium text-white shadow-sm transition-colors hover:bg-accent/90"
              >
                <Bot className="h-5 w-5" />
                Créer un agent
              </Link>
              <Link
                href="/explore"
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-card px-6 text-base font-medium text-ink transition-colors hover:border-accent"
              >
                Explorer les agents
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-page px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="text-center font-display text-2xl font-bold text-ink">
            Explorer par catégorie
          </h2>
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {(categories || []).map((cat) => (
              <Link
                key={cat.slug}
                href={`/c/${cat.slug}`}
                className="group flex flex-col items-center gap-3 rounded-xl border border-line bg-card p-6 transition-all hover:border-accent hover:shadow-md"
              >
                <span className="text-3xl">
                  {cat.icon || CATEGORY_ICONS[cat.slug] || "📁"}
                </span>
                <span className="text-sm font-medium text-ink transition-colors group-hover:text-accent">
                  {cat.name}
                </span>
              </Link>
            ))}
          </div>
          {(!categories || categories.length === 0) && (
            <p className="mt-8 text-center text-sm text-ink-soft">
              Les catégories seront disponibles prochainement.
            </p>
          )}
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
