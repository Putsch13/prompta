import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Aide & FAQ — Prompta",
  description:
    "Installer Prompta partout, connecter tes apps, crédits et BYOK, validations humaines, historique des missions.",
};

const SECTIONS: Array<{ title: string; items: Array<{ q: string; a: string }> }> = [
  {
    title: "Prompta partout (extension)",
    items: [
      {
        q: "C'est quoi, Prompta partout ?",
        a: "L'extension Chromium (Chrome, Edge, Brave, Arc, Opera) qui met l'assistant sur toutes tes pages : clic sur le P → panneau à droite ; question → réponse au tac au tac ; ordre ambitieux → mission d'agent avec validations humaines.",
      },
      {
        q: "Comment l'installer ?",
        a: "Guide sur Installer Prompta partout : télécharge le ZIP, mode développeur, charger le dossier, épingler le P, te connecter dans le même navigateur (Chrome / Edge / Brave / Arc / Opera).",
      },
      {
        q: "Ça marche sur Firefox ou Safari ?",
        a: "Pas tel quel. Firefox demanderait un polyfill et un packaging Add-ons ; Safari une conversion Web Extension + compte Apple. En attendant : /quick marche dans n'importe quel navigateur.",
      },
      {
        q: "L'assistant peut-il lire mes autres onglets ?",
        a: "Oui — coche-les dans « Ce que je vois » ou mentionne-les (« compare les 3 devis ouverts ») : le contenu est lu par TON navigateur, avec ta session (CRM, mails, dashboards).",
      },
      {
        q: "Comment fonctionne le pilotage du navigateur ?",
        a: "Quand une mission l'exige, l'agent agit dans ton onglet : toast + halo sur l'élément, clic ou saisie sous tes yeux. Action risquée → confirmation dans la page. Jamais de mot de passe ni de paiement.",
      },
      {
        q: "Je n'ai pas l'extension : je peux quand même essayer ?",
        a: "Oui — /quick dans le navigateur (même cerveau, sans panneau sur les autres sites ni lecture d'onglets).",
      },
    ],
  },
  {
    title: "Connexions & applications",
    items: [
      {
        q: "Combien d'applications sont disponibles ?",
        a: "Plus de 1 000 apps (Gmail, Sheets, Notion, Slack, Canva, HubSpot…) via OAuth dans Connexions. Connecte une fois, les missions peuvent les utiliser.",
      },
      {
        q: "Un run échoue avec « autorisation manquante » alors que l'app est connectée ?",
        a: "Certaines apps demandent des permissions supplémentaires selon l'action. Va dans Connexions → Reconnecter pour refaire l'OAuth à jour.",
      },
      {
        q: "Mes identifiants sont-ils stockés chez Prompta ?",
        a: "Non. L'OAuth passe par notre partenaire d'intégration : Prompta ne voit jamais tes mots de passe. Tu peux révoquer à tout moment.",
      },
    ],
  },
  {
    title: "Crédits, clés API & plans",
    items: [
      {
        q: "Comment fonctionnent les crédits IA ?",
        a: "Chaque mission consomme des crédits selon les modèles (2 € offerts à l'inscription, recharge selon le plan). Suivi dans Crédits.",
      },
      {
        q: "Puis-je utiliser mes propres clés API (BYOK) ?",
        a: "Oui — ajoute tes clés OpenAI, Anthropic, Google ou Mistral dans Connexions : la conso part sur TES comptes fournisseurs.",
      },
    ],
  },
  {
    title: "Runs, validations, historique",
    items: [
      {
        q: "C'est quoi une validation humaine ?",
        a: "Une pause avant une action sensible : tu vois le contenu (email, publication…), tu corriges ou refuses, dans Validations. Tu es notifié par email.",
      },
      {
        q: "Où retrouver une mission ?",
        a: "Dashboard → Runs : chaque exécution a son dossier (étapes, logs, livrables). Les liens depuis l'extension pointent ici.",
      },
      {
        q: "Comment arrêter une mission en cours ?",
        a: "Bouton stop dans l'extension / /quick, ou Arrêter dans le dossier du run.",
      },
      {
        q: "Autre problème ?",
        a: "Écris-nous : contact@prompta.fr — on répond vite.",
      },
    ],
  },
];

export default function AidePage() {
  return (
    <div className="relative min-h-screen bg-bg">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-hud-halo" />
      <div className="relative mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <p className="hud-label">[ Aide ]</p>
      <h1 className="mt-3 font-display text-4xl font-bold text-ink">
        Questions fréquentes
      </h1>
      <p className="mt-3 text-ink-soft">
        Installer Prompta partout, connecter tes apps, comprendre les missions et les validations.{" "}
        <Link href="/prompta-partout" className="font-medium text-accent hover:underline">
          Guide d&apos;installation →
        </Link>
      </p>

      <div className="mt-10 space-y-10">
        {SECTIONS.map((section, i) => (
          <section key={section.title}>
            <h2 className="mb-4 flex items-baseline gap-2.5 font-display text-xl font-bold text-ink">
              <span className="font-mono text-sm font-semibold text-accent">
                {String(i + 1).padStart(2, "0")}
              </span>
              {section.title}
            </h2>
            <div className="space-y-3">
              {section.items.map((item) => (
                <details
                  key={item.q}
                  className="hud-card group p-4 open:border-accent/40 open:shadow-glow-sm"
                >
                  <summary className="cursor-pointer list-none font-medium text-ink marker:hidden">
                    {item.q}
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{item.a}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="hud-corners mt-14 rounded-lg border border-accent/30 bg-accent/5 p-8 text-center">
        <p className="font-display text-lg font-semibold text-ink">
          Prêt à installer Prompta partout ?
        </p>
        <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/prompta-partout"
            className="inline-flex rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-accent-ink shadow-glow-sm transition-all hover:bg-accent-hover hover:shadow-glow"
          >
            Guide d&apos;installation
          </Link>
          <Link
            href="/quick"
            className="inline-flex rounded-lg border border-line bg-card px-6 py-2.5 text-sm font-medium text-ink transition-all hover:border-accent/50 hover:shadow-glow-sm"
          >
            Essayer sans extension
          </Link>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: SECTIONS.flatMap((s) =>
              s.items.map((item) => ({
                "@type": "Question",
                name: item.q,
                acceptedAnswer: { "@type": "Answer", text: item.a },
              })),
            ),
          }),
        }}
      />
      </div>
    </div>
  );
}
