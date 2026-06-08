import { Bot, Play, Bug, Plug } from "lucide-react";
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
  const supabase = createClient();

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
          <div className="grid gap-10 md:grid-cols-3">
            <div className="text-center">
              <Plug className="mx-auto h-10 w-10 text-accent" />
              <h3 className="mt-4 font-display text-lg font-semibold text-ink">
                Connecte tes outils
              </h3>
              <p className="mt-2 text-sm text-ink-soft">
                Gmail, Google Sheets, Slack, Telegram, Canva… Branche un compte
                en un clic et choisis tes ressources dans une liste, sans copier
                d&apos;ID à la main.
              </p>
            </div>
            <div className="text-center">
              <Play className="mx-auto h-10 w-10 text-accent" />
              <h3 className="mt-4 font-display text-lg font-semibold text-ink">
                Lance pour de vrai
              </h3>
              <p className="mt-2 text-sm text-ink-soft">
                Exécution réelle par défaut, ou aperçu à blanc quand tu veux.
                Étapes, parallélisme et validations humaines intégrées.
              </p>
            </div>
            <div className="text-center">
              <Bug className="mx-auto h-10 w-10 text-accent" />
              <h3 className="mt-4 font-display text-lg font-semibold text-ink">
                Débugge sans douleur
              </h3>
              <p className="mt-2 text-sm text-ink-soft">
                Logs par étape, erreurs traduites en actions concrètes et
                historique complet des runs. Tu vois exactement ce qui bloque.
              </p>
            </div>
          </div>
        </div>
      </section>

      <B2BSection />
    </div>
  );
}
