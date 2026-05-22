import { Search, Sparkles, Package, Shield } from "lucide-react";
import Link from "next/link";

const CATEGORIES = [
  { slug: "copywriting", name: "Copywriting", icon: "pencil" },
  { slug: "code", name: "Code & Dev", icon: "code" },
  { slug: "marketing", name: "Marketing", icon: "megaphone" },
  { slug: "sales", name: "Sales", icon: "trending-up" },
  { slug: "data", name: "Data & Analytics", icon: "bar-chart" },
  { slug: "design", name: "Design", icon: "palette" },
  { slug: "hr", name: "RH & Recrutement", icon: "users" },
  { slug: "support", name: "Support Client", icon: "headphones" },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
              Des prompts{" "}
              <span className="text-accent">prêts à tourner</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted">
              Découvrez une marketplace de prompts, agents et workflows IA avec
              bundles complets : prompt + environnement + guide. Publiés par des
              builders vérifiés.
            </p>

            {/* Barre de recherche */}
            <div className="mt-10">
              <form action="/explore" method="get" className="relative mx-auto max-w-xl">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  name="q"
                  placeholder="Rechercher un prompt, agent, workflow…"
                  className="h-14 w-full rounded-xl border border-border bg-card pl-12 pr-4 text-base shadow-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Catégories */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="text-center text-2xl font-bold">Explorer par catégorie</h2>
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {CATEGORIES.map((cat) => (
              <Link
                key={cat.slug}
                href={`/explore?category=${cat.slug}`}
                className="group flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 transition-all hover:border-accent hover:shadow-md"
              >
                <span className="text-3xl">
                  {cat.icon === "pencil" && "✏️"}
                  {cat.icon === "code" && "💻"}
                  {cat.icon === "megaphone" && "📣"}
                  {cat.icon === "trending-up" && "📈"}
                  {cat.icon === "bar-chart" && "📊"}
                  {cat.icon === "palette" && "🎨"}
                  {cat.icon === "users" && "👥"}
                  {cat.icon === "headphones" && "🎧"}
                </span>
                <span className="text-sm font-medium group-hover:text-accent transition-colors">
                  {cat.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="border-t border-border bg-accent-light/30">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-10 md:grid-cols-3">
            <div className="text-center">
              <Package className="mx-auto h-10 w-10 text-accent" />
              <h3 className="mt-4 text-lg font-semibold">Bundles complets</h3>
              <p className="mt-2 text-sm text-muted">
                Prompt + .env.example + variables + guide de démarrage. Tout ce
                qu&apos;il faut pour démarrer en 5 minutes.
              </p>
            </div>
            <div className="text-center">
              <Shield className="mx-auto h-10 w-10 text-accent" />
              <h3 className="mt-4 text-lg font-semibold">Builders vérifiés</h3>
              <p className="mt-2 text-sm text-muted">
                Réputation type LinkedIn : avis vérifiés, badges, stats
                publiques. Zéro bruit, que de la qualité.
              </p>
            </div>
            <div className="text-center">
              <Sparkles className="mx-auto h-10 w-10 text-accent" />
              <h3 className="mt-4 text-lg font-semibold">Versioning intégré</h3>
              <p className="mt-2 text-sm text-muted">
                Chaque prompt évolue. Recevez les mises à jour et consultez le
                changelog — comme du code.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
