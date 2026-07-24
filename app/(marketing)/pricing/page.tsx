import type { Metadata } from "next";
import Link from "next/link";
import { Key, RefreshCw, ShieldCheck } from "lucide-react";
import { PLANS, PLAN_ORDER, WELCOME_CREDIT_CENTS } from "@/lib/billing/plans";
import { PlanGrid, type PlanCardData } from "@/components/pricing/PlanGrid";

export const metadata: Metadata = {
  title: "Tarifs — Prompta partout | crédits IA & missions",
  description:
    "Prompta partout gratuit avec 2 € de crédits offerts. Illimité 29 €/mois : agents illimités + 35 € de crédits IA inclus. Pro 99 €/mois : multi-desk + 120 € inclus.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Tarifs Prompta — Prompta partout dès 0 €",
    description:
      "2 € de crédits IA offerts. Illimité 29 € (35 € de crédits inclus), Pro 99 € (120 € inclus + multi-desk). BYOK sur tous les plans.",
  },
};

const FAQ = [
  {
    q: "Le plan gratuit suffit pour démarrer ?",
    a: "Oui. Tu installes Prompta partout et tu as 2 € de crédits IA à l'inscription. Une fois épuisés, ajoute tes propres clés API (BYOK) — tac au tac et missions en illimité, sans toucher tes crédits — ou recharge à la carte.",
  },
  {
    q: "Que paient les crédits IA ?",
    a: "Les appels aux modèles (GPT, Claude, Gemini, Mistral) quand tu tournes sur nos clés. Chaque plan payant recharge ton solde chaque mois : 35 € en Illimité, 120 € en Pro.",
  },
  {
    q: "35 € de crédits pour 29 € — comment c'est possible ?",
    a: "Les crédits sont valorisés au tarif catalogue des recharges. En t'abonnant, tu obtiens environ 20 % de crédits en plus qu'à la carte : c'est l'avantage de l'abonnement, et le solde non utilisé reste acquis.",
  },
  {
    q: "Puis-je utiliser mes propres clés API (BYOK) ?",
    a: "Oui, sur tous les plans. Ajoute tes clés dans Connexions : les runs BYOK sont illimités et ne consomment jamais tes crédits Prompta.",
  },
  {
    q: "C'est quoi un « agent gardé » ?",
    a: "Un agent actif dans ta bibliothèque, prêt à être relancé — créé depuis l'extension ou le builder. En Découverte tu en gardes 1 ; sur les plans payants ils sont illimités.",
  },
  {
    q: "C'est quoi le multi-desk du plan Pro ?",
    a: "Jusqu'à 3 postes (ordinateurs / profils Chrome) utilisent le même compte Prompta et partagent le même solde de crédits — pratique pour un indépendant multi-machines ou une petite équipe. Besoin de plus de postes, de volume ou d'un SLA ? Écris-nous pour une offre sur devis.",
  },
  {
    q: "Que se passe-t-il si je dépasse mes crédits inclus ?",
    a: "Tu peux recharger à la carte ou basculer en BYOK. Rien n'est coupé sans prévenir.",
  },
  {
    q: "Puis-je changer de plan ou annuler ?",
    a: "Tu changes de plan en un clic — la différence est facturée au prorata immédiatement, sans double abonnement. Tu peux annuler à tout moment : l'annulation prend effet en fin de période et tu gardes l'accès (et tes crédits) jusque-là.",
  },
  {
    q: "L'extension marche sur Safari / Firefox ?",
    a: "Chrome, Edge, Brave, Arc, Opera : oui. Firefox : en bêta (paquet dédié). Safari : en préparation. Sinon /quick marche partout, sans installation.",
  },
];

export default function PricingPage() {
  const plans: PlanCardData[] = PLAN_ORDER.map((id) => {
    const p = PLANS[id];
    return {
      id: p.id,
      label: p.label,
      priceCents: p.priceCents,
      tagline: p.tagline,
      features: p.features,
      highlight: p.highlight,
    };
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "Prompta",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description:
          "Assistant navigateur Prompta partout : réponses instantanées et missions d'agent avec validations humaines.",
        offers: PLAN_ORDER.map((id) => ({
          "@type": "Offer",
          name: `Prompta ${PLANS[id].label}`,
          price: (PLANS[id].priceCents / 100).toFixed(2),
          priceCurrency: "EUR",
        })),
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <div className="min-h-screen bg-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="relative overflow-hidden border-b border-line bg-hud-grid">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-hud-halo" />
        <div className="relative mx-auto max-w-page px-4 pb-14 pt-20 text-center sm:px-6 lg:px-8">
          <p className="hud-label animate-fade-up">[ Tarifs ]</p>
          <h1
            className="mx-auto mt-4 max-w-3xl animate-fade-up font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl"
            style={{ animationDelay: "80ms" }}
          >
            Prompta partout, <span className="text-accent">gratuit pour démarrer</span>
          </h1>
          <p
            className="mx-auto mt-5 max-w-2xl animate-fade-up text-lg text-ink-soft"
            style={{ animationDelay: "160ms" }}
          >
            {(WELCOME_CREDIT_CENTS / 100).toLocaleString("fr-FR")} € de crédits IA offerts à
            l&apos;inscription — sans carte. Passe à un plan payant quand tes missions
            tournent vraiment pour toi.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-page px-4 py-12 sm:px-6 lg:px-8">
        <PlanGrid plans={plans} />
        <div className="mx-auto mt-10 grid max-w-4xl gap-4 text-sm text-ink-soft sm:grid-cols-3">
          <p className="flex items-start gap-2">
            <Key className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>
              <strong className="text-ink">BYOK sur tous les plans</strong> — tes clés OpenAI /
              Anthropic = runs illimités, zéro crédit consommé.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>
              <strong className="text-ink">Sans engagement</strong> — change de plan ou annule en
              un clic, effet en fin de période.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>
              <strong className="text-ink">Validation humaine intégrée</strong> — aucun envoi
              sensible sans ton feu vert.
            </span>
          </p>
        </div>
      </section>

      <section className="border-t border-line bg-card2/50">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <p className="hud-label text-center">[ FAQ ]</p>
          <h2 className="mt-3 text-center font-display text-2xl font-bold text-ink">
            Questions fréquentes
          </h2>
          <div className="mt-8 space-y-3">
            {FAQ.map((f) => (
              <details
                key={f.q}
                className="hud-card group p-4 open:border-accent/40 open:shadow-glow-sm"
              >
                <summary className="cursor-pointer list-none font-medium text-ink marker:hidden">
                  {f.q}
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-10 text-center">
            <Link
              href="/prompta-partout"
              className="inline-flex h-12 items-center rounded-lg bg-accent px-8 text-base font-semibold text-accent-ink shadow-glow-sm transition-all hover:bg-accent-hover hover:shadow-glow"
            >
              Installer Prompta partout →
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
