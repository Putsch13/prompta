import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * Pages « cas d'usage » SEO — un template, plusieurs scénarios concrets.
 * Chaque page cible une requête longue traîne (« automatiser sa veille »,
 * « rapport automatique google sheets »…) et débouche sur le wizard
 * avec l'objectif prérempli.
 */

interface UseCase {
  title: string;
  metaTitle: string;
  metaDescription: string;
  hook: string;
  steps: string[];
  apps: string[];
  objectif: string;
  faq: Array<{ q: string; a: string }>;
}

const USE_CASES: Record<string, UseCase> = {
  "veille-quotidienne": {
    title: "Ta veille quotidienne, faite par un agent IA",
    metaTitle: "Automatiser sa veille quotidienne avec un agent IA — Prompta",
    metaDescription:
      "Un agent IA qui cherche les actualités de ton secteur chaque matin et t'envoie un résumé clair par email. Sans code, en 3 minutes.",
    hook:
      "Chaque matin à 8h, ton agent parcourt le web, croise les sources, rédige un résumé hiérarchisé et te l'envoie par email — avant ton premier café.",
    steps: [
      "Recherche web sur tes sujets (marché, concurrents, technologie)",
      "Analyse et hiérarchisation par IA : l'info à retenir d'abord",
      "Rédaction d'un résumé clair avec sources",
      "Envoi par email chaque matin à l'heure que tu choisis",
    ],
    apps: ["Recherche web", "Gmail", "Google Sheets (archivage optionnel)"],
    objectif:
      "Chaque matin, cherche les 3 actualités les plus importantes de mon secteur et envoie-moi un résumé clair et hiérarchisé par email.",
    faq: [
      {
        q: "Puis-je choisir mes sources et mes sujets ?",
        a: "Oui : tu décris tes sujets en langage naturel et le copilote configure les recherches. Tu peux affiner à tout moment.",
      },
      {
        q: "L'envoi est-il vraiment automatique ?",
        a: "Oui — planification intégrée (chaque jour ou chaque semaine, heure de Paris). Tu peux aussi lancer à la demande.",
      },
    ],
  },
  "reporting-automatique": {
    title: "Ton reporting hebdo, écrit directement dans Google Sheets",
    metaTitle: "Rapport automatique dans Google Sheets avec un agent IA — Prompta",
    metaDescription:
      "Un agent IA qui analyse tes fichiers Drive chaque semaine, synthétise les avancées et remplit ta feuille Google Sheets. Validation humaine incluse.",
    hook:
      "Chaque lundi, ton agent lit tes documents récents, en tire les chiffres et points clés, remplit ta feuille de reporting et attend ta validation avant d'envoyer le récap à ton équipe (ou juste à toi).",
    steps: [
      "Lecture de tes fichiers Google Drive récents",
      "Synthèse IA : avancées, chiffres, points de blocage",
      "Écriture structurée dans ta feuille Google Sheets",
      "Validation humaine : tu relis et approuves avant tout envoi",
    ],
    apps: ["Google Drive", "Google Sheets", "Gmail"],
    objectif:
      "Chaque lundi matin, analyse mes fichiers Drive récents, synthétise les avancées de la semaine et écris les points clés dans une feuille Google Sheets, puis envoie-moi le récap par email après ma validation.",
    faq: [
      {
        q: "L'agent peut-il écrire dans une feuille existante ?",
        a: "Oui — tu choisis la feuille cible dans le builder (ou l'agent en crée une). Les données sont écrites en colonnes propres, pas en texte brut.",
      },
      {
        q: "Et si l'analyse est fausse ?",
        a: "L'étape de validation humaine te montre le contenu AVANT toute écriture ou envoi : tu peux l'éditer ou rejeter.",
      },
    ],
  },
  "prospection-contenu": {
    title: "Du contenu de prospection prêt à publier, chaque semaine",
    metaTitle: "Automatiser son contenu LinkedIn avec un agent IA — Prompta",
    metaDescription:
      "Un agent IA qui suit l'actualité de ton marché, rédige tes posts et prépare tes visuels Canva. Tu valides, il publie.",
    hook:
      "Ton agent surveille ton marché, propose des angles, rédige des posts calibrés pour LinkedIn et prépare le visuel Canva assorti. Tu relis, tu ajustes, tu valides — il ne publie jamais sans toi.",
    steps: [
      "Veille sur ton secteur et tes concurrents",
      "Rédaction de posts avec hook, structure et CTA",
      "Création du visuel Canva assorti",
      "Validation humaine puis publication ou envoi du kit par email",
    ],
    apps: ["Recherche web", "Canva", "LinkedIn", "Gmail"],
    objectif:
      "Chaque semaine, fais une veille sur mon secteur, rédige un post LinkedIn avec un bon hook et prépare un visuel Canva assorti, puis envoie-moi le tout pour validation.",
    faq: [
      {
        q: "L'agent publie-t-il directement sur LinkedIn ?",
        a: "Seulement si tu l'y autorises — et avec une validation humaine avant chaque publication. Par défaut, il t'envoie le kit complet par email.",
      },
      {
        q: "Le ton des posts est-il personnalisable ?",
        a: "Oui : tu donnes ton persona, ton ton et tes exemples au copilote — chaque étape de rédaction est configurée avec TA voix.",
      },
    ],
  },
};

export async function generateStaticParams() {
  return Object.keys(USE_CASES).map((slug) => ({ slug }));
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
