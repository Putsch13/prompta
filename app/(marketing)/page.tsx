import { Search, Sparkles, Package, Shield } from "lucide-react";
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
              Des prompts{" "}
              <span className="text-accent">prêts à tourner</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-ink-soft">
              Découvrez une marketplace de prompts, agents et workflows IA avec
              bundles complets : prompt + environnement + guide. Publiés par des
              builders vérifiés.
            </p>

            <div className="mt-10">
              <form
                action="/explore"
                method="get"
                className="relative mx-auto max-w-xl"
              >
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-faint" />
                <input
                  type="text"
                  name="q"
                  placeholder="Rechercher un prompt, agent, workflow…"
                  className="h-14 w-full rounded-xl border border-line bg-card pl-12 pr-4 text-base text-ink shadow-sm outline-none transition-shadow placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </form>
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
              <Package className="mx-auto h-10 w-10 text-accent" />
              <h3 className="mt-4 font-display text-lg font-semibold text-ink">
                Bundles complets
              </h3>
              <p className="mt-2 text-sm text-ink-soft">
                Prompt + .env.example + variables + guide de démarrage. Tout ce
                qu&apos;il faut pour démarrer en 5 minutes.
              </p>
            </div>
            <div className="text-center">
              <Shield className="mx-auto h-10 w-10 text-accent" />
              <h3 className="mt-4 font-display text-lg font-semibold text-ink">
                Builders vérifiés
              </h3>
              <p className="mt-2 text-sm text-ink-soft">
                Réputation type LinkedIn : avis vérifiés, badges, stats
                publiques. Zéro bruit, que de la qualité.
              </p>
            </div>
            <div className="text-center">
              <Sparkles className="mx-auto h-10 w-10 text-accent" />
              <h3 className="mt-4 font-display text-lg font-semibold text-ink">
                Versioning intégré
              </h3>
              <p className="mt-2 text-sm text-ink-soft">
                Chaque prompt évolue. Recevez les mises à jour et consultez le
                changelog — comme du code.
              </p>
            </div>
          </div>
        </div>
      </section>

      <B2BSection />
    </div>
  );
}
