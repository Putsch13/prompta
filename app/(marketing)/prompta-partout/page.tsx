import type { Metadata } from "next";
import Link from "next/link";
import {
  Zap,
  Download,
  Pin,
  KeyRound,
  MessageSquare,
  Rocket,
  MousePointerClick,
  ShieldCheck,
  Keyboard,
  Puzzle,
  ArrowRight,
  Check,
  ExternalLink,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Installer Prompta partout — guide",
  description:
    "Installer et configurer l'extension Chrome Prompta partout : installation en 2 minutes, raccourcis, connexions apps, tac au tac et missions avec validation humaine.",
  alternates: { canonical: "/prompta-partout" },
};

const INSTALL_STEPS = [
  {
    n: "1",
    title: "Télécharge le dossier de l'extension",
    body: "Sur GitHub, ouvre le dossier extension/ puis Code → Download ZIP (ou clone le repo). Tu as besoin du dossier extension/ dézippé.",
  },
  {
    n: "2",
    title: "Ouvre chrome://extensions",
    body: "Colle chrome://extensions dans la barre d'adresse Chrome (ou Edge). Active le Mode développeur en haut à droite.",
  },
  {
    n: "3",
    title: "Charge l'extension non empaquetée",
    body: "Clique « Charger l'extension non empaquetée » et sélectionne le dossier extension/ (celui qui contient manifest.json).",
  },
  {
    n: "4",
    title: "Épingle le « P » dans la barre",
    body: "Clique l'icône puzzle 🧩 de Chrome, puis la punaise à côté de « Prompta Everywhere ». L'icône P reste visible.",
  },
  {
    n: "5",
    title: "Connecte-toi à Prompta",
    body: "Ouvre Prompta dans un onglet du même navigateur et connecte-toi. L'extension partage ta session — sans compte, rien ne part.",
  },
];

const USE_WAYS = [
  {
    icon: Puzzle,
    title: "Clic sur l'icône P",
    desc: "Un panneau glisse depuis la droite (pleine hauteur), sur la page où tu es. Re-clique pour le fermer.",
  },
  {
    icon: Keyboard,
    title: "Alt + P",
    desc: "Même panneau latéral, sans quitter le clavier. Idéal pour enchaîner pendant que tu lis.",
  },
  {
    icon: MousePointerClick,
    title: "Clic droit sur une sélection",
    desc: "« Prompta : agir sur la sélection » — le panneau s'ouvre avec ta sélection déjà prise en compte.",
  },
];

export default function PromptaPartoutPage() {
  return (
    <div className="min-h-screen bg-bg">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(79,70,229,0.12),transparent_70%)]"
        />
        <div className="mx-auto max-w-page px-4 pb-16 pt-16 sm:px-6 sm:pt-20 lg:px-8">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent-light px-3 py-1 text-sm font-medium text-accent">
            <Zap className="h-3.5 w-3.5" />
            Guide d&apos;installation
          </p>
          <h1 className="mt-5 max-w-3xl font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            Prompta partout
            <span className="mt-2 block text-2xl font-semibold text-ink-soft sm:text-3xl">
              L&apos;assistant dans ton navigateur, en 2 minutes
            </span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-ink-soft">
            Extension Chrome (mode développeur pour l&apos;instant) : tu poses une
            question sur n&apos;importe quelle page, ou tu lances une mission sur
            tes apps — avec validations humaines sur tout ce qui est sensible.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="https://github.com/Putsch13/prompta/tree/main/extension"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-base font-semibold text-white shadow-lg shadow-accent/25 hover:bg-accent-hover"
            >
              <Download className="h-5 w-5" />
              Télécharger l&apos;extension
              <ExternalLink className="h-4 w-4 opacity-70" />
            </a>
            <Link
              href="/quick"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-card px-6 text-base font-medium text-ink hover:border-accent"
            >
              Essayer sans extension (/quick)
            </Link>
          </div>
        </div>
      </section>

      {/* Installation */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-page px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Installation (Chrome / Edge)
          </h2>
          <p className="mt-2 max-w-2xl text-ink-soft">
            Pas encore sur le Chrome Web Store — tu l&apos;installes en mode
            développeur, une fois. Ensuite elle se met à jour quand tu recharges
            le dossier.
          </p>
          <ol className="mt-10 space-y-6">
            {INSTALL_STEPS.map((s) => (
              <li key={s.n} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-sm font-bold text-white">
                  {s.n}
                </span>
                <div>
                  <h3 className="font-display text-lg font-semibold text-ink">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card2/60 px-5 py-4 text-sm text-ink-soft">
            <Pin className="h-5 w-5 shrink-0 text-accent" />
            <span>
              Après chaque mise à jour du code :{" "}
              <code className="rounded bg-card px-1.5 py-0.5 text-ink">chrome://extensions</code>{" "}
              → icône ⟳ sur Prompta Everywhere.
            </span>
          </div>
        </div>
      </section>

      {/* Utilisation */}
      <section className="border-b border-line bg-card2/40">
        <div className="mx-auto max-w-page px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Comment l&apos;utiliser
          </h2>
          <p className="mt-2 max-w-2xl text-ink-soft">
            Trois façons d&apos;ouvrir Prompta — même cerveau derrière.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {USE_WAYS.map((w) => (
              <div key={w.title} className="rounded-2xl border border-line bg-card p-6">
                <w.icon className="h-8 w-8 text-accent" />
                <h3 className="mt-4 font-display font-semibold text-ink">{w.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Deux régimes */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-page px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Un cerveau, deux vitesses
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-card p-7">
              <MessageSquare className="h-9 w-9 text-accent" />
              <h3 className="mt-4 font-display text-lg font-semibold text-ink">
                Tac au tac
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                « Résume cette page », « traduis ma sélection », « explique ce
                tableau » — réponse en streaming, sans quitter la page. L&apos;assistant
                voit ce que tu vois.
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-card p-7">
              <Rocket className="h-9 w-9 text-accent" />
              <h3 className="mt-4 font-display text-lg font-semibold text-ink">
                Mission
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Dès que l&apos;ordre exige d&apos;agir (apps, livrables, croiser des
                onglets, piloter un formulaire), il bascule tout seul en agent :
                plan, exécution live, validations, re-planification si ça coince.
              </p>
            </div>
          </div>
          <ul className="mt-8 space-y-3">
            {[
              "Coche les onglets à lire dans « Ce que je vois » — même derrière login (session Chrome).",
              "Connecte tes apps (Gmail, Sheets, Canva…) dans Connexions avant les missions d'écriture.",
              "Les actions sensibles (envoyer, publier, payer…) demandent ton feu vert — dans le dashboard ou dans la page en pilotage.",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3 text-sm text-ink-soft">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Config */}
      <section className="border-b border-line bg-card2/40">
        <div className="mx-auto max-w-page px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Configuration
          </h2>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-line bg-card p-7">
              <KeyRound className="h-8 w-8 text-accent" />
              <h3 className="mt-4 font-display font-semibold text-ink">
                Apps & clés API
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Dans le back-office : connecte Gmail, Sheets, Notion… et/ou ajoute
                tes clés (OpenAI, Anthropic…). BYOK = exécutions illimitées côté
                modèle.
              </p>
              <Link
                href="/dashboard/connexions"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
              >
                Ouvrir Connexions <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="rounded-2xl border border-line bg-card p-7">
              <ShieldCheck className="h-8 w-8 text-accent" />
              <h3 className="mt-4 font-display font-semibold text-ink">
                Instance Prompta
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Par défaut l&apos;extension pointe vers ton instance déployée. Pour
                changer l&apos;URL (dev local, autre domaine) : service worker de
                l&apos;extension → console →
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-[#101019] px-4 py-3 text-xs text-white/85">
                {`chrome.storage.sync.set({\n  promptaBaseUrl: "https://ton-domaine"\n})`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Exemples */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-page px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Exemples d&apos;ordres
          </h2>
          <ul className="mt-8 space-y-3">
            {[
              { q: "Résume cette page en 5 points.", t: "tac au tac" },
              {
                q: "Compare les 3 devis ouverts dans mes onglets et dis-moi le mieux-disant.",
                t: "mission",
              },
              {
                q: "Lis la bdd affichée, croise avec mon Drive, fais une prez Canva et envoie-la-moi.",
                t: "mission + validation",
              },
              {
                q: "Remplis ce formulaire fournisseur avec les infos de ma sélection — ne l'envoie qu'après confirmation.",
                t: "pilotage navigateur",
              },
            ].map((e) => (
              <li
                key={e.q}
                className="flex flex-col gap-1 rounded-xl border border-line bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm text-ink">« {e.q} »</span>
                <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-accent">
                  {e.t}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="mx-auto max-w-page px-4 py-16 text-center sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Prêt ?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-soft">
            Installe l&apos;extension, connecte une app, donne un premier ordre.
            L&apos;historique et les validations sont dans ton dashboard.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="https://github.com/Putsch13/prompta/tree/main/extension"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-7 text-base font-semibold text-white hover:bg-accent-hover"
            >
              <Download className="h-5 w-5" /> Installer
            </a>
            <Link
              href="/dashboard/connexions"
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-card px-7 text-base font-medium text-ink hover:border-accent"
            >
              Configurer mes connexions
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
