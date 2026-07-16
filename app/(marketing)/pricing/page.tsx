import type { Metadata } from "next";
import Link from "next/link";
import { Key, RefreshCw, ShieldCheck } from "lucide-react";
import { PLANS, PLAN_ORDER, WELCOME_CREDIT_CENTS } from "@/lib/billing/plans";
import { PlanGrid, type PlanCardData } from "@/components/pricing/PlanGrid";

export const metadata: Metadata = {
  title: "Tarifs — Prompta partout | crédits IA & missions",
  description:
    "Prompta partout gratuit avec 2 € de crédits offerts. Plans dès 19 €/mois : missions d'agent, validations humaines, BYOK illimité.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Tarifs Prompta — Prompta partout dès 0 €",
    description:
      "2 € de crédits IA offerts. Starter 19 €, Pro 49 €, Scale 149 € — crédits inclus chaque mois. BYOK sur tous les plans.",
  },
};

const FAQ = [
  {
    q: "Le plan gratuit suffit pour démarrer ?",
    a: "Oui. Tu installes Prompta partout, tu as 2 € de crédits IA à l'inscription, et avec tes propres clés API (BYOK) le tac au tac et les missions n'entament pas tes crédits Prompta.",
  },
  {
    q: "Que paient les crédits IA ?",
    a: "Les appels aux modèles (GPT, Claude, Gemini, Mistral) quand tu tournes sur nos clés. Chaque plan payant recharge ton solde chaque mois (10 € / 30 € / 100 €).",
  },
  {
    q: "Puis-je utiliser mes propres clés API (BYOK) ?",
    a: "Oui, sur tous les plans. Ajoute tes clés dans Connexions : les runs BYOK sont illimités et ne consomment jamais tes crédits Prompta.",
  },
  {
    q: "C'est quoi un « agent gardé » ?",
    a: "Une mission réussie que tu enregistres depuis l'extension pour la relancer plus tard. Le quota dépend du plan (1 / 5 / 20 / illimité).",
  },
  {
    q: "Que se passe-t-il si je dépasse mes crédits inclus ?",
    a: "Tu peux recharger à la carte ou basculer en BYOK. Rien n'est coupé sans prévenir.",
  },
  {
    q: "Puis-je changer de plan ou annuler ?",
    a: "À tout moment. L'annulation prend effet en fin de période.",
  },
  {
    q: "L'extension marche sur Safari / Firefox ?",
    a: "Pas encore. Chrome, Edge, Brave, Arc, Opera oui. Sur Safari/Firefox, utilise /quick en attendant.",
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

      <section className="mx-auto max-w-page px-4 pb-8 pt-20 text-center sm:px-6 lg:px-8">
        <p className="text-[11px] font-bold uppercase tracking-wider text-accent">Tarifs</p>
        <h1 className="mx-auto mt-3 max-w-3xl font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          Prompta partout, <span className="text-accent">gratuit pour démarrer</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-soft">
          {(WELCOME_CREDIT_CENTS / 100).toLocaleString("fr-FR")} € de crédits IA offerts à
          l&apos;inscription — sans carte. Passe à un plan payant quand tes missions
          tournent vraiment pour toi.
        </p>
      </section>

      <section className="mx-auto max-w-page px-4 py-10 sm:px-6 lg:px-8">
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
          <h2 className="text-center font-display text-2xl font-bold text-ink">
            Questions fréquentes
          </h2>
          <div className="mt-8 space-y-3">
            {FAQ.map((f) => (
              <details
                key={f.q}
                className="group rounded-xl border border-line bg-card p-4 open:shadow-sm"
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
              className="inline-flex h-12 items-center rounded-xl bg-accent px-8 text-base font-semibold text-white hover:bg-accent/90"
            >
              Installer Prompta partout →
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
