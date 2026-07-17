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
} from "lucide-react";
import { BrowserCompatBanner } from "@/components/marketing/BrowserCompatBanner";
import { ExtensionPanelDemo } from "@/components/marketing/ExtensionPanelDemo";

export const metadata: Metadata = {
  title: "Installer Prompta partout — guide",
  description:
    "Installer Prompta partout sur Chrome, Edge, Brave, Arc ou Opera : panneau latéral, raccourcis, connexions apps. Firefox et Safari non supportés pour l'instant.",
  alternates: { canonical: "/prompta-partout" },
};

/**
 * URL du listing Chrome Web Store — dès qu'elle est renseignée (env Render),
 * la page bascule en « Ajouter à Chrome » et relègue le ZIP en méthode avancée.
 */
const STORE_URL = process.env.NEXT_PUBLIC_CHROME_STORE_URL;

const BROWSERS_OK = [
  {
    name: "Chrome",
    badge: "Cible officielle",
    url: "chrome://extensions",
    note: "Manifest V3, APIs chrome.* — c’est la référence.",
  },
  {
    name: "Edge",
    badge: "Chromium",
    url: "edge://extensions",
    note: "Même install « charger non empaquetée ».",
  },
  {
    name: "Brave",
    badge: "Chromium",
    url: "brave://extensions",
    note: "Idem Chrome. Épingler le P via l’icône puzzle.",
  },
  {
    name: "Arc",
    badge: "Chromium",
    url: "arc://extensions",
    note: "En général OK. Extensions via le menu Arc / Extensions.",
  },
  {
    name: "Opera",
    badge: "Chromium",
    url: "opera://extensions",
    note: "Activer le mode développeur, puis charger le dossier.",
  },
];

const BROWSERS_NO = [
  {
    name: "Firefox",
    why: "APIs proches, mais il faut adapter (polyfill browser.*, background, packaging Add-ons). Pas supporté tel quel.",
  },
  {
    name: "Safari",
    why: "Conversion en Safari Web Extension + compte Apple / packaging Mac. Plus lourd — pas supporté pour l’instant.",
  },
];

const INSTALL_STEPS = [
  {
    n: "1",
    title: "Télécharge et dézippe",
    body: "Le ZIP = l'extension elle-même (le code que Chrome va charger). Double-clique pour dézipper : tu obtiens un dossier avec un fichier nommé manifest.json dedans.",
  },
  {
    n: "2",
    title: "Ouvre la page Extensions de Chrome",
    body: "Dans la barre d'adresse, colle chrome://extensions et appuie Entrée. En haut à droite, active « Mode développeur ».",
  },
  {
    n: "3",
    title: "Dis à Chrome où est le dossier",
    body: "Clique « Charger l'extension non empaquetée », puis choisis le dossier que tu viens de dézipper (pas le .zip lui-même — le dossier ouvert).",
  },
  {
    n: "4",
    title: "Épingle le « P »",
    body: "Clique l'icône puzzle 🧩 en haut à droite de Chrome, puis la punaise à côté de « Prompta Everywhere ». Le P reste visible.",
  },
  {
    n: "5",
    title: "Connecte-toi sur Prompta",
    body: "Ouvre Prompta dans un onglet du même Chrome et connecte-toi. Ensuite, sur n'importe quel site, clic sur le P → le panneau sort à droite.",
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
      <section className="relative overflow-hidden border-b border-line bg-hud-grid">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-hud-halo" />
        <div className="relative mx-auto max-w-page px-4 pb-16 pt-16 sm:px-6 sm:pt-20 lg:px-8">
          <BrowserCompatBanner />
          <p className="hud-label inline-flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            [ Guide d&apos;installation ]
          </p>
          <h1 className="mt-5 max-w-3xl font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            Prompta partout
            <span className="mt-2 block text-2xl font-semibold text-ink-soft sm:text-3xl">
              L&apos;assistant dans ton navigateur, en 2 minutes
            </span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-ink-soft">
            C&apos;est une <strong className="font-semibold text-ink">extension de navigateur</strong>{" "}
            (comme un petit programme qui s&apos;ajoute à Chrome) : tu cliques le P
            en haut → un panneau glisse à droite sur n&apos;importe quelle page.
          </p>
          {!STORE_URL && (
            <div className="hud-card mt-6 max-w-2xl px-5 py-4 text-sm leading-relaxed text-ink-soft">
              <p className="font-semibold text-ink">Pourquoi un fichier ZIP ?</p>
              <p className="mt-1.5">
                Prompta n&apos;est <strong className="font-medium text-ink">pas encore</strong> sur
                le Chrome Web Store (le « magasin » d&apos;extensions) — la
                soumission est en cours. En attendant, on te donne
                l&apos;extension en fichier compressé : tu le dézippes, tu le
                charges une fois dans Chrome, et le P apparaît en haut. Dès que
                le Store valide, ce sera un clic « Ajouter à Chrome ».
              </p>
            </div>
          )}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {STORE_URL ? (
              <a
                href={STORE_URL}
                target="_blank"
                rel="noopener"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-accent px-6 text-base font-semibold text-accent-ink shadow-glow-sm transition-all hover:bg-accent-hover hover:shadow-glow"
              >
                <Puzzle className="h-5 w-5" />
                Ajouter à Chrome — gratuit
              </a>
            ) : (
              <a
                href="/downloads/prompta-everywhere.zip"
                download="prompta-everywhere.zip"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-accent px-6 text-base font-semibold text-accent-ink shadow-glow-sm transition-all hover:bg-accent-hover hover:shadow-glow"
              >
                <Download className="h-5 w-5" />
                Télécharger l&apos;extension (ZIP)
              </a>
            )}
            <Link
              href="/quick"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-line bg-card px-6 text-base font-medium text-ink transition-all hover:border-accent/50 hover:shadow-glow-sm"
            >
              Essayer sans installer (/quick)
            </Link>
          </div>
          <p className="mt-3 text-sm text-ink-faint">
            Chrome, Edge, Brave, Arc ou Opera — pas Safari, pas Firefox.
          </p>

          <ExtensionPanelDemo />
          <p className="mt-4 text-center text-sm text-ink-soft">
            Aperçu du comportement : le panneau sort à droite quand tu cliques le P
            (ici en démo — en vrai, sur une page web dans Chrome &amp; co.).
          </p>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto max-w-page px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Sur quels navigateurs ?
          </h2>
          <p className="mt-2 max-w-2xl text-ink-soft">
            Même ZIP, même geste « charger non empaquetée » sur tout Chromium.
            Firefox et Safari : pas encore.
          </p>

          <h3 className="hud-label mt-10">[ Ça marche ]</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BROWSERS_OK.map((b) => (
              <div
                key={b.name}
                className="hud-card px-5 py-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-semibold text-ink">{b.name}</span>
                  <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-accent">
                    {b.badge}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{b.note}</p>
                <p className="mt-2 font-mono text-xs text-ink-faint">{b.url}</p>
              </div>
            ))}
          </div>

          <h3 className="mt-10 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint">[ Pas supporté tel quel ]</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {BROWSERS_NO.map((b) => (
              <div
                key={b.name}
                className="rounded-2xl border border-dashed border-line bg-card2/50 px-5 py-4"
              >
                <span className="font-display font-semibold text-ink">{b.name}</span>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{b.why}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-line bg-card2/40">
        <div className="mx-auto max-w-page px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            {STORE_URL ? "Installation manuelle (méthode avancée)" : "Installation (Chromium)"}
          </h2>
          <p className="mt-2 max-w-2xl text-ink-soft">
            {STORE_URL
              ? "Tu préfères charger l'extension toi-même (version de développement, mises à jour manuelles) ? Voici la méthode ZIP — sinon, le bouton « Ajouter à Chrome » ci-dessus suffit."
              : "Pas encore sur les stores — tu l'installes en mode développeur, une fois. Ensuite : recharge l'extension après chaque mise à jour."}
          </p>
          <ol className="mt-10 space-y-6">
            {INSTALL_STEPS.map((s) => (
              <li key={s.n} className="flex gap-4">
                <span className="hud-corners flex h-10 w-10 shrink-0 items-center justify-center border border-accent/30 bg-accent/10 font-mono text-sm font-bold text-accent">
                  {s.n.padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-display text-lg font-semibold text-ink">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="hud-card mt-8 flex flex-wrap items-center gap-3 px-5 py-4 text-sm text-ink-soft">
            <Pin className="h-5 w-5 shrink-0 text-accent" />
            <span>
              Après une mise à jour : page Extensions → ⟳ sur Prompta Everywhere,
              puis recharge aussi l&apos;onglet de la page (sinon l&apos;ancien
              panneau reste en mémoire).
            </span>
          </div>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto max-w-page px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Comment l&apos;utiliser
          </h2>
          <p className="mt-2 max-w-2xl text-ink-soft">
            Trois façons d&apos;ouvrir Prompta — même cerveau derrière.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {USE_WAYS.map((w) => (
              <div key={w.title} className="hud-card p-6">
                <w.icon className="h-8 w-8 text-accent" />
                <h3 className="mt-4 font-display font-semibold text-ink">{w.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-line bg-card2/40">
        <div className="mx-auto max-w-page px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Un cerveau, deux vitesses
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            <div className="hud-card p-7">
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
            <div className="hud-card p-7">
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
              "Coche les onglets à lire dans « Ce que je vois » — même derrière login (session du navigateur).",
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

      <section className="border-b border-line">
        <div className="mx-auto max-w-page px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Configuration
          </h2>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div className="hud-card p-7">
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
            <div className="hud-card p-7">
              <ShieldCheck className="h-8 w-8 text-accent" />
              <h3 className="mt-4 font-display font-semibold text-ink">
                Instance Prompta
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Par défaut l&apos;extension pointe vers ton instance déployée. Pour
                changer l&apos;URL (dev local, autre domaine) : service worker de
                l&apos;extension → console →
              </p>
              <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-bg px-4 py-3 font-mono text-xs text-ink-soft">
                {`chrome.storage.sync.set({\n  promptaBaseUrl: "https://ton-domaine"\n})`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-line bg-card2/40">
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
                className="hud-card flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm text-ink">« {e.q} »</span>
                <span className="shrink-0 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-accent">
                  {e.t}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-page px-4 py-16 text-center sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Prêt ?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-soft">
            Installe l&apos;extension dans Chrome (ou Edge / Brave…), connecte une
            app, donne un premier ordre. L&apos;historique et les validations sont
            dans ton dashboard.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="/downloads/prompta-everywhere.zip"
              download="prompta-everywhere.zip"
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-accent px-7 text-base font-semibold text-accent-ink shadow-glow-sm transition-all hover:bg-accent-hover hover:shadow-glow"
            >
              <Download className="h-5 w-5" /> Télécharger le ZIP
            </a>
            <Link
              href="/dashboard/connexions"
              className="inline-flex h-12 items-center gap-2 rounded-lg border border-line bg-card px-7 text-base font-medium text-ink transition-all hover:border-accent/50 hover:shadow-glow-sm"
            >
              Configurer mes connexions
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
