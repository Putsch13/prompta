import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, ShieldCheck, Terminal, Zap } from "lucide-react";
import { USE_CASES_SEO, useCaseBySlug } from "@/lib/marketing/use-cases-seo";

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return USE_CASES_SEO.map((u) => ({ slug: u.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const uc = useCaseBySlug(slug);
  if (!uc) return {};
  return {
    title: uc.title,
    description: uc.metaDescription,
    alternates: { canonical: `/cas-usage/${uc.slug}` },
    openGraph: { title: uc.title, description: uc.metaDescription },
  };
}

export default async function UseCasePage({ params }: Props) {
  const { slug } = await params;
  const uc = useCaseBySlug(slug);
  if (!uc) notFound();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://prompta-sjtf.onrender.com";
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: uc.h1,
      description: uc.metaDescription,
      step: uc.steps.map((s, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: s.title,
        text: s.body,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: uc.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Prompta", item: appUrl },
        { "@type": "ListItem", position: 2, name: "Cas d'usage", item: `${appUrl}/cas-usage` },
        { "@type": "ListItem", position: 3, name: uc.h1, item: `${appUrl}/cas-usage/${uc.slug}` },
      ],
    },
  ];

  const others = USE_CASES_SEO.filter((u) => u.slug !== uc.slug).slice(0, 3);

  return (
    <div className="min-h-screen bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="bg-hud-grid relative overflow-hidden border-b border-line">
        <div aria-hidden className="bg-hud-halo pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <nav aria-label="Fil d'Ariane" className="font-mono text-xs text-ink-faint">
            <Link href="/" className="hover:text-ink-soft">Prompta</Link>
            {" / "}
            <Link href="/cas-usage" className="hover:text-ink-soft">Cas d&apos;usage</Link>
          </nav>
          <p className="hud-label mt-6">[ {uc.kicker} ]</p>
          <h1 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
            {uc.h1}
          </h1>
          <p className="mt-5 text-lg leading-8 text-ink-soft">{uc.intro}</p>

          {/* L'ordre prêt à l'emploi */}
          <div className="hud-corners mt-8 rounded-xl border border-accent/25 bg-card/90 p-4">
            <p className="hud-label !text-ink-faint mb-2 flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5" /> L&apos;ordre à donner
            </p>
            <p className="font-mono text-sm leading-relaxed text-accent-hover">
              « {uc.exampleOrder} »
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/prompta-partout"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-ink shadow-glow-sm transition-all hover:bg-accent-hover hover:shadow-glow"
            >
              <Zap className="h-4 w-4" /> Installer Prompta — gratuit
            </Link>
            <Link
              href="/quick"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-6 text-sm font-medium text-ink transition-all hover:border-accent/50"
            >
              Essayer sans extension
            </Link>
          </div>
        </div>
      </section>

      {/* Comment ça marche */}
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
        <h2 className="font-display text-2xl font-bold text-ink">Comment ça marche</h2>
        <ol className="mt-8 space-y-6">
          {uc.steps.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="hud-corners flex h-10 w-10 shrink-0 items-center justify-center border border-accent/30 bg-accent/10 font-mono text-sm font-bold text-accent">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-display text-lg font-semibold text-ink">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="hud-card mt-10 p-6">
          <p className="hud-label">Pourquoi c&apos;est mieux qu&apos;un chatbot</p>
          <ul className="mt-4 space-y-3">
            {uc.benefits.map((b) => (
              <li key={b} className="flex items-start gap-3 text-sm leading-relaxed text-ink-soft">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                {b}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-xl border border-warning/25 bg-warning/5 p-4 text-sm leading-relaxed text-ink-soft">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <span>
            <strong className="text-ink">Tu gardes le contrôle :</strong> chaque action
            sensible (envoi, écriture CRM, publication) attend ta validation, le
            pilotage du navigateur se fait sous tes yeux, et tout est tracé dans
            ton dossier de mission.
          </span>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-line bg-card/40">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl font-bold text-ink">Questions fréquentes</h2>
          <div className="mt-6 space-y-3">
            {uc.faq.map((f) => (
              <details key={f.q} className="hud-card group p-5 open:shadow-glow-sm">
                <summary className="cursor-pointer list-none font-medium text-ink marker:content-none">
                  {f.q}
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Maillage interne + CTA */}
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
        <h2 className="hud-label">Autres cas d&apos;usage</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {others.map((o) => (
            <Link key={o.slug} href={`/cas-usage/${o.slug}`} className="hud-card group p-4">
              <p className="text-sm font-medium leading-snug text-ink group-hover:text-accent">{o.h1}</p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs text-accent">
                Lire <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/prompta-partout"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-8 text-base font-semibold text-accent-ink shadow-glow transition-all hover:bg-accent-hover hover:shadow-glow-lg"
          >
            <Zap className="h-5 w-5" /> Installer Prompta partout — gratuit
          </Link>
          <p className="mt-3 font-mono text-xs text-ink-faint">2 € de crédits IA offerts · sans carte bancaire</p>
        </div>
      </section>
    </div>
  );
}
