import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { USE_CASES, USE_CASE_SLUGS } from "@/lib/marketing/use-cases";

/**
 * Pages « cas d'usage » SEO — un template, plusieurs scénarios concrets.
 * Chaque page cible une requête longue traîne (« automatiser sa veille »,
 * « rapport automatique google sheets »…) et débouche sur le wizard
 * avec l'objectif prérempli.
 */

export async function generateStaticParams() {
  return USE_CASE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const uc = USE_CASES[slug];
  if (!uc) return {};
  return {
    title: uc.metaTitle,
    description: uc.metaDescription,
    openGraph: { title: uc.metaTitle, description: uc.metaDescription },
  };
}

export default async function UseCasePage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const uc = USE_CASES[slug];
  if (!uc) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-accent">Cas d&apos;usage</p>
      <h1 className="mt-1 font-display text-4xl font-bold leading-tight text-ink">{uc.title}</h1>
      <p className="mt-4 text-lg leading-relaxed text-ink-soft">{uc.hook}</p>

      <div className="mt-10 rounded-2xl border border-line bg-card p-6">
        <h2 className="font-display text-lg font-bold text-ink">Ce que fait l&apos;agent</h2>
        <ol className="mt-4 space-y-3">
          {uc.steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                {i + 1}
              </span>
              <span className="text-sm text-ink-soft">{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-xs text-ink-faint">
          Applications : {uc.apps.join(" · ")} — parmi 1 000+ connectables.
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-accent/30 bg-accent/5 p-8 text-center">
        <p className="font-display text-lg font-semibold text-ink">
          Construis cet agent en 3 minutes — l&apos;objectif est déjà prérempli.
        </p>
        <Link
          href={`/dashboard/new?objectif=${encodeURIComponent(uc.objectif)}`}
          className="mt-4 inline-flex rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
        >
          Créer cet agent
        </Link>
        <p className="mt-3 text-xs text-ink-faint">Gratuit pour démarrer · 2 € de crédits IA offerts</p>
      </div>

      <div className="mt-12">
        <h2 className="mb-4 font-display text-xl font-bold text-ink">Questions fréquentes</h2>
        <div className="space-y-3">
          {uc.faq.map((item) => (
            <details key={item.q} className="group rounded-xl border border-line bg-card p-4 open:border-accent/40">
              <summary className="cursor-pointer list-none font-medium text-ink">{item.q}</summary>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{item.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-sm text-ink-soft">
          Plus de questions ? Voir l&apos;<Link href="/aide" className="text-accent hover:underline">aide complète</Link>.
        </p>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: uc.faq.map((i) => ({
              "@type": "Question",
              name: i.q,
              acceptedAnswer: { "@type": "Answer", text: i.a },
            })),
          }),
        }}
      />
    </div>
  );
}
