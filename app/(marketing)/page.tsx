import type { Metadata } from "next";
import {
  Zap,
  Check,
  ShieldCheck,
  Loader2,
  ArrowRight,
  Globe,
  Eye,
  MousePointerClick,
  Layers,
  MessageSquare,
  Rocket,
} from "lucide-react";
import Link from "next/link";
import { PLANS } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prompta — l'IA qui voit ton écran et fait le travail",
  description:
    "L'assistant dans ton navigateur : réponse instantanée sur n'importe quelle page, missions complètes sur tes apps (Gmail, Sheets, Canva…), pilotage du navigateur sous tes yeux. Chaque action sensible attend ton feu vert.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Prompta — l'IA qui voit ton écran et fait le travail",
    description:
      "Réponse au tac au tac, missions cross-app, pilotage du navigateur en copilote visible. Validation humaine sur tout ce qui est sensible.",
  },
};

/** Slugs Composio des 20 apps les plus courantes — logos affichés en carrousel. */
const TOP_APP_SLUGS = [
  "gmail", "googlesheets", "googledrive", "googlecalendar", "googledocs",
  "notion", "slack", "canva", "linkedin", "github",
  "hubspot", "trello", "airtable", "stripe", "shopify",
  "instagram", "twitter", "youtube", "telegram", "discord",
];

/** Repli texte si le catalogue est indisponible au rendu. */
const APPS_FALLBACK = [
  "Gmail", "Google Sheets", "Google Drive", "Canva", "Notion", "Slack",
  "Google Calendar", "HubSpot", "Telegram", "GitHub", "Airtable", "Trello",
  "LinkedIn", "Stripe", "Shopify", "Instagram", "YouTube", "Discord",
];

const DEMO_STEPS = [
  { label: "Lecture des 3 onglets ouverts (avec ta session)", state: "done" },
  { label: "Analyse croisée des devis (GPT-5.4)", state: "done" },
  { label: "Pilotage du navigateur — remplissage du formulaire", state: "done" },
  { label: "Confirmation dans la page — en attente de ton feu vert", state: "waiting" },
  { label: "Récap envoyé par email", state: "pending" },
];

export default async function HomePage() {
  // Logos officiels des apps phares (catalogue Composio, cache serveur 15 min).
  let appLogos: Array<{ label: string; logo?: string }> = [];
  try {
    const { listComposioToolkits } = await import("@/lib/composio/catalog");
    const toolkits = await listComposioToolkits();
    const byId = new Map(toolkits.map((t) => [t.id, t]));
    appLogos = TOP_APP_SLUGS.flatMap((slug) => {
      const tk = byId.get(slug);
      return tk ? [{ label: tk.label, logo: tk.logo }] : [];
    });
  } catch {
    // catalogue indisponible → repli texte
  }
  if (appLogos.length < 10) {
    appLogos = APPS_FALLBACK.map((label) => ({ label }));
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 h-[480px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(79,70,229,0.14),transparent_70%)]"
        />
        <div className="mx-auto max-w-page px-4 pb-16 pt-20 sm:px-6 sm:pt-28 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent-light px-4 py-1.5 text-sm font-medium text-accent">
              <Globe className="h-4 w-4" />
              Prompta partout — l&apos;assistant dans ton navigateur
            </p>
            <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-ink sm:text-6xl">
              <span className="block text-ink">Prompta.</span>
              L&apos;IA qui voit ton écran
              <br />
              <span className="bg-gradient-to-r from-accent to-violet-500 bg-clip-text text-transparent">
                et fait le travail.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-ink-soft">
              Pose une question, elle répond au tac au tac sur n&apos;importe quelle page.
              Donne un ordre, elle lit tes onglets, agit sur tes apps — Gmail, Sheets,
              Canva, Notion… — et pilote même ton navigateur sous tes yeux.
              Chaque action sensible attend ton feu vert.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/quick"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-7 text-base font-semibold text-white shadow-lg shadow-accent/25 transition-all hover:bg-accent-hover hover:shadow-accent/35"
              >
                <Zap className="h-5 w-5" />
                Essayer l&apos;assistant
              </Link>
              <Link
                href="/prompta-partout"
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-card px-7 text-base font-medium text-ink transition-colors hover:border-accent"
              >
                <Globe className="h-5 w-5" />
                Installer Prompta partout
              </Link>
            </div>
            <p className="mt-4 text-sm text-ink-faint">
              Gratuit pour démarrer · 2 € de crédits IA offerts · sans carte bancaire
            </p>
          </div>

          {/* ── Panneau extension (mock produit) ── */}
          <div className="mx-auto mt-14 max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#101019] shadow-2xl shadow-accent/10">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-[#8b7cff] to-[#5b4fe0] text-xs font-extrabold text-white">
                P
              </span>
              <span className="text-xs font-medium text-white/60">
                Prompta partout — sur ta page, dans tes onglets
              </span>
              <span className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> LIVE
              </span>
            </div>
            <div className="p-4">
              <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-[#8b7cff] to-[#5b4fe0] px-4 py-2 text-sm text-white">
                Compare les 3 devis ouverts dans mes onglets et remplis le formulaire
                fournisseur avec le meilleur
              </p>
              <ul className="mt-4 space-y-1">
                {DEMO_STEPS.map((s, i) => (
                  <li key={s.label} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm">
                    <span className="w-4 text-xs text-white/30">{i + 1}</span>
                    {s.state === "done" && <Check className="h-4 w-4 shrink-0 text-emerald-400" />}
                    {s.state === "waiting" && (
                      <ShieldCheck className="h-4 w-4 shrink-0 animate-pulse text-amber-300" />
                    )}
                    {s.state === "pending" && (
                      <Loader2 className="h-4 w-4 shrink-0 text-white/25" />
                    )}
                    <span
                      className={
                        s.state === "done"
                          ? "text-white/80"
                          : s.state === "waiting"
                            ? "font-medium text-amber-200"
                            : "text-white/35"
                      }
                    >
                      {s.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── DEUX RÉGIMES ────────────────────────────────────────────────── */}
      <section className="border-t border-line bg-card2/50">
        <div className="mx-auto max-w-page px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-bold uppercase tracking-wider text-accent">
              Un cerveau, deux vitesses
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-ink sm:text-3xl">
              Du tac au tac à la mission complète
            </h2>
          </div>
          <div className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-card p-7">
              <MessageSquare className="h-9 w-9 text-accent" />
              <h3 className="mt-4 font-display text-lg font-semibold text-ink">
                Réponse instantanée
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                « Résume cette page », « traduis ma sélection », « explique ce tableau » —
                la réponse arrive en streaming, en moins d&apos;une seconde, sans quitter
                ta page. L&apos;assistant voit ce que tu vois.
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-card p-7">
              <Rocket className="h-9 w-9 text-accent" />
              <h3 className="mt-4 font-display text-lg font-semibold text-ink">
                Mission d&apos;agent
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                « Lis la bdd affichée, croise-la avec mon Drive, fais-moi une prez Canva
                et envoie-la-moi » — il bascule tout seul en agent complet : plan,
                exécution live, validations humaines, re-planification si une étape échoue.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── SUPERPOUVOIRS ───────────────────────────────────────────────── */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-page px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-bold uppercase tracking-wider text-accent">
              Ce qu&apos;aucun chatbot ne fait
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-ink sm:text-3xl">
              Il travaille là où tu travailles
            </h2>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Eye,
                title: "Il voit tes onglets — même connectés",
                desc: "Le contenu réel de tes onglets ouverts est lu par ton navigateur, avec ta session : dashboards, CRM, mails ouverts. Il compare, croise et synthétise ce qu'aucune IA « extérieure » ne peut voir.",
              },
              {
                icon: Layers,
                title: "Il agit sur 1 000+ apps",
                desc: "Gmail, Sheets, Canva, Notion, HubSpot, Shopify… Il crée, écrit, envoie pour de vrai — chaque écriture sensible passe par ta validation, que tu peux relire et corriger.",
              },
              {
                icon: MousePointerClick,
                title: "Il pilote ton navigateur, sous tes yeux",
                desc: "Formulaires, clics, navigation : l'agent agit dans ton onglet en copilote visible. Chaque action est annoncée, l'élément visé est surligné, et rien de risqué ne part sans ta confirmation dans la page.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-line bg-card p-7 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5"
              >
                <f.icon className="h-9 w-9 text-accent" />
                <h3 className="mt-4 font-display text-lg font-semibold text-ink">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── APPS ────────────────────────────────────────────────────────── */}
      <section className="border-t border-line bg-card">
        <div className="mx-auto max-w-page px-4 py-12 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-semibold text-ink">
            Plus de 1 000 applications connectables
          </p>
          <p className="mt-1 text-center text-xs font-bold uppercase tracking-wider text-ink-faint">
            Connecté à tes outils du quotidien
          </p>
          {/* Carrousel infini : deux copies de la rangée, translation -50 %. */}
          <div className="marquee-mask relative mt-8 overflow-hidden">
            <div className="animate-marquee flex w-max items-center gap-3">
              {[0, 1].map((copy) => (
                <div key={copy} aria-hidden={copy === 1} className="flex items-center gap-3 pr-3">
                  {appLogos.map((app) => (
                    <span
                      key={`${copy}-${app.label}`}
                      className="flex shrink-0 items-center gap-2.5 rounded-full border border-line bg-bg px-4 py-2 text-sm font-medium text-ink-soft"
                    >
                      {app.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={app.logo}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="h-6 w-6 rounded object-contain"
                        />
                      ) : null}
                      {app.label}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CONFIANCE ───────────────────────────────────────────────────── */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-page px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-accent">
                Contrôle total
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold text-ink sm:text-3xl">
                Rien ne part sans ton feu vert
              </h2>
              <ul className="mt-6 space-y-4">
                {[
                  "Validation humaine avant chaque action sensible — email, publication, CRM, e-commerce. Tu relis, corriges ou refuses.",
                  "Pilotage du navigateur en copilote visible : action annoncée, élément surligné, confirmation dans la page pour tout ce qui est risqué. Jamais de mot de passe, jamais de paiement.",
                  "Dossier de mission complet : chaque entrée, chaque sortie, chaque email envoyé est tracé dans ton back-office.",
                  "Le contenu des pages est traité comme une donnée non fiable : un texte malveillant ne peut pas donner d'ordres à ton agent. Jetons OAuth chiffrés, clés API jamais exposées.",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-ink-soft">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                    <span className="text-sm leading-relaxed">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
                Confirmation requise
              </p>
              <p className="mt-2 font-medium text-amber-950">
                Prompta veut : envoyer le formulaire fournisseur
              </p>
              <div className="mt-3 rounded-xl border border-amber-200 bg-white p-4 text-sm text-ink-soft">
                Devis retenu : Alpha SARL (2 340 € — le mieux-disant sur les 3 onglets
                comparés). Le formulaire est rempli, prêt à partir.
              </div>
              <div className="mt-4 flex gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
                  <Check className="h-4 w-4" /> Autoriser
                </span>
                <span className="inline-flex items-center rounded-lg border border-line bg-white px-4 py-2 text-sm text-ink-soft">
                  Refuser
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ───────────────────────────────────────────────────── */}
      <section className="border-t border-line bg-card2/50">
        <div className="mx-auto max-w-page px-4 py-20 text-center sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl font-bold text-ink">
            Ton assistant, sur toutes tes pages, dans 2 minutes
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-soft">
            Essaye dans le navigateur, ou installe l&apos;extension — même cerveau,
            validations humaines, historique dans ton back-office.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/prompta-partout"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-8 text-base font-semibold text-white shadow-lg shadow-accent/25 hover:bg-accent-hover"
            >
              <Globe className="h-5 w-5" /> Installer Prompta partout
            </Link>
            <Link
              href="/quick"
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-card px-8 text-base font-medium text-ink hover:border-accent"
            >
              Essayer sans extension <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-6 text-sm text-ink-faint">
            Plans dès {PLANS.free.priceCents === 0 ? "0 €" : `${PLANS.free.priceCents / 100} €`}
            {" · "}BYOK = exécutions illimitées
          </p>
        </div>
      </section>
    </div>
  );
}
