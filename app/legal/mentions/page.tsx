import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Mentions légales | Prompta",
  description:
    "Mentions légales de Prompta : éditeur, hébergement, données, paiement, contact.",
  alternates: { canonical: "/legal/mentions" },
};

const ROWS = [
  { label: "Éditeur", value: "Puccini EI (entrepreneur individuel)" },
  { label: "SIREN", value: "932 699 697" },
  { label: "Responsable de la publication", value: "Florent Puccini" },
  { label: "Adresse", value: "824 chemin de la Daby, 83330 Le Beausset, France" },
  { label: "Téléphone", value: "06 74 81 80 67" },
  { label: "Email", value: "contact@prompta.fr" },
  {
    label: "TVA",
    value:
      "TVA non applicable, article 293 B du Code général des impôts (franchise en base).",
  },
];

const STACK = [
  {
    label: "Hébergement du site",
    value:
      "Render Services, Inc. — 525 Brannan Street, Suite 300, San Francisco, CA 94107, USA (render.com). Instances hébergées dans l'Union européenne (région Francfort).",
  },
  {
    label: "Stockage des données",
    value:
      "Supabase, Inc. (supabase.com) — base de données et authentification, hébergées dans l'Union européenne. Les jetons de connexion aux applications tierces sont chiffrés au repos.",
  },
  {
    label: "Paiements",
    value:
      "Stripe Payments Europe, Ltd. (stripe.com) — Prompta ne stocke aucune donnée de carte bancaire ; elles sont traitées exclusivement par Stripe.",
  },
];

export default function MentionsLegalesPage() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <p className="hud-label">[ Légal ]</p>
        <h1 className="mt-3 font-display text-3xl font-bold text-ink">
          Mentions légales
        </h1>

        <section className="hud-card mt-8 divide-y divide-line">
          {ROWS.map((r) => (
            <div key={r.label} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:gap-6">
              <span className="w-56 shrink-0 text-sm font-semibold text-ink">{r.label}</span>
              <span className="text-sm leading-relaxed text-ink-soft">{r.value}</span>
            </div>
          ))}
        </section>

        <h2 className="mt-10 font-display text-xl font-bold text-ink">
          Prestataires techniques
        </h2>
        <section className="hud-card mt-4 divide-y divide-line">
          {STACK.map((r) => (
            <div key={r.label} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:gap-6">
              <span className="w-56 shrink-0 text-sm font-semibold text-ink">{r.label}</span>
              <span className="text-sm leading-relaxed text-ink-soft">{r.value}</span>
            </div>
          ))}
        </section>

        <h2 className="mt-10 font-display text-xl font-bold text-ink">Cookies</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Prompta n&apos;utilise <strong className="text-ink">aucun cookie publicitaire ni
          traceur d&apos;audience tiers</strong>. Seuls des cookies strictement nécessaires au
          fonctionnement du service sont déposés (session d&apos;authentification
          Supabase) — ils sont exemptés de consentement au sens des lignes
          directrices de la CNIL. Lors d&apos;un paiement, Stripe peut déposer ses
          propres cookies sur ses pages de paiement, régis par sa politique.
        </p>

        <p className="mt-10 text-sm text-ink-faint">
          Voir aussi : <Link href="/legal/terms" className="text-accent hover:underline">Conditions générales</Link>
          {" · "}
          <Link href="/legal/privacy" className="text-accent hover:underline">Politique de confidentialité</Link>
        </p>
      </div>
    </div>
  );
}
