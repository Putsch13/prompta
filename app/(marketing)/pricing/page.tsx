import type { Metadata } from "next";
import Link from "next/link";
import { Key, RefreshCw, ShieldCheck } from "lucide-react";
import { PLANS, PLAN_ORDER, WELCOME_CREDIT_CENTS } from "@/lib/billing/plans";
import { PlanGrid, type PlanCardData } from "@/components/pricing/PlanGrid";

export const metadata: Metadata = {
  title: "Tarifs — Créez votre agent IA gratuitement | Prompta",
  description:
    "Publiez votre premier agent IA gratuitement avec 2 € de crédits GPT & Claude offerts. Plans dès 19 €/mois avec crédits IA inclus. Vos propres clés API acceptées (BYOK).",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Tarifs Prompta — agents IA sans code, dès 0 €",
    description:
      "1 agent publié gratuit, 2 € de crédits IA offerts. Starter 19 €, Pro 49 €, Scale 149 € — crédits IA inclus chaque mois.",
  },
};

const FAQ = [
  {
    q: "Le plan gratuit est-il vraiment gratuit ?",
    a: "Oui. Vous construisez autant d'agents que vous voulez, vous en hébergez un en production, et vous recevez 2 € de crédits IA (GPT + Claude) à l'inscription — sans carte bancaire.",
  },
  {
    q: "Que sont les crédits IA inclus ?",
    a: "Chaque plan payant crédite votre compte tous les mois (10 € sur Starter, 30 € sur Pro, 100 € sur Scale). Ces crédits paient les appels aux modèles (GPT, Claude, Gemini, Mistral) quand vos agents tournent sur nos clés.",
  },
  {
    q: "Puis-je utiliser mes propres clés API (BYOK) ?",
    a: "Oui, sur tous les plans — comme sur Cursor. Ajoutez vos clés OpenAI/Anthropic/Google/Mistral dans Connexions : les runs BYOK ne consomment jamais vos crédits Prompta et sont illimités.",
  },
  {
    q: "Que se passe-t-il si je dépasse mes crédits inclus ?",
    a: "Vos agents continuent : vous pouvez recharger des crédits à la carte à tout moment, ou basculer en BYOK. Aucun agent n'est coupé sans prévenir.",
  },
  {
    q: "Puis-je changer de plan ou annuler ?",
    a: "À tout moment. L'annulation prend effet en fin de période — vos agents en production au-delà du quota repassent simplement en brouillon, rien n'est supprimé.",
  },
  {
    q: "Mes données et mes comptes sont-ils en sécurité ?",
    a: "Vos jetons OAuth sont chiffrés, chaque action sensible peut exiger votre validation humaine avant exécution, et le dossier de mission trace tout ce que l'agent a fait — entrées, sorties, emails envoyés.",
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
          "Plateforme no-code pour créer, lancer et débugger des agents IA connectés à 1000+ applications.",
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
          Ton premier agent IA en production, <span className="text-accent">gratuitement</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-soft">
          {(WELCOME_CREDIT_CENTS / 100).toLocaleString("fr-FR")} € de crédits IA offerts à
          l&apos;inscription — sans carte bancaire. Passe à un plan payant quand tes agents
          travaillent vraiment pour toi.
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
              href="/signup"
              className="inline-flex h-12 items-center rounded-xl bg-accent px-8 text-base font-semibold text-white hover:bg-accent/90"
            >
              Créer mon premier agent →
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
