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
import { Logo } from "@/components/Logo";
import { AiCoreScene } from "@/components/marketing/AiCoreScene";
import { Reveal } from "@/components/marketing/Reveal";

export const revalidate = 900;

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
      {/* ── HERO cinématique : cœur de particules 3D en fond ────────────── */}
      <section className="relative flex min-h-[92vh] flex-col justify-center overflow-hidden">
        <div aria-hidden className="bg-hud-grid absolute inset-0 opacity-60" />
        <AiCoreScene />
        <div aria-hidden className="hud-vignette" />
        <div aria-hidden className="hud-scanline animate-scan top-0" />
        <div className="relative mx-auto w-full max-w-page px-4 pb-16 pt-20 sm:px-6 sm:pt-24 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="hud-label animate-fade-up mx-auto inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent-light/60 px-4 py-1.5 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 animate-blink rounded-full bg-accent" />
              Prompta partout — l&apos;assistant dans ton navigateur
            </p>
            <h1
              className="animate-fade-up mt-7 font-display text-[2.6rem] font-bold leading-[1.06] tracking-tight text-ink sm:text-7xl"
              style={{ animationDelay: "0.08s", textShadow: "0 2px 40px rgba(2,6,12,0.9)" }}
            >
              <span className="block">L&apos;IA qui voit ton écran</span>
              <span className="bg-gradient-to-r from-accent via-[#BAE6FD] to-accent bg-clip-text text-transparent [filter:drop-shadow(0_0_24px_rgba(56,189,248,0.45))]">
                et fait le travail.
              </span>
            </h1>
            <p
              className="animate-fade-up mx-auto mt-6 max-w-2xl text-lg leading-8 text-ink-soft"
              style={{ animationDelay: "0.16s" }}
            >
              Pose une question, elle répond au tac au tac sur n&apos;importe quelle page.
              Donne un ordre, elle lit tes onglets, agit sur tes apps — Gmail, Sheets,
              Canva, Notion… — et pilote même ton navigateur sous tes yeux.
              Chaque action sensible attend ton feu vert.
            </p>

            <div
              className="animate-fade-up mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
              style={{ animationDelay: "0.24s" }}
            >
              <Link
                href="/prompta-partout"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-7 text-base font-semibold text-accent-ink shadow-glow transition-all hover:bg-accent-hover hover:shadow-glow-lg"
              >
                <Globe className="h-5 w-5" />
                Installer Prompta partout
              </Link>
              <Link
                href="/quick"
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-card/70 px-7 text-base font-medium text-ink backdrop-blur-sm transition-all hover:border-accent/50 hover:shadow-glow-sm"
              >
                <Zap className="h-5 w-5 text-accent" />
                Essayer sans extension
              </Link>
            </div>
            <p className="mt-4 font-mono text-xs tracking-wide text-ink-faint">
              Gratuit pour démarrer · 2 € de crédits IA offerts · sans carte bancaire
            </p>
          </div>

          {/* ── Panneau extension (mock produit) — cascade au scroll ── */}
          <Reveal className="mx-auto mt-20 max-w-2xl">
            <div className="hud-corners overflow-hidden rounded-2xl border border-accent/20 bg-card/90 shadow-glow-lg backdrop-blur-md">
              <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
                <Logo size={22} animate={false} />
                <span className="font-mono text-[11px] tracking-wide text-ink-soft">
                  PROMPTA PARTOUT — SUR TA PAGE, DANS TES ONGLETS
                </span>
                <span className="ml-auto flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 font-mono text-[10px] font-bold text-success">
                  <span className="h-1.5 w-1.5 animate-blink rounded-full bg-success" /> LIVE
                </span>
              </div>
              <div className="p-4">
                <p className="stagger ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md border border-accent/30 bg-accent-light px-4 py-2 text-sm text-ink">
                  Compare les 3 devis ouverts dans mes onglets et remplis le formulaire
                  fournisseur avec le meilleur
                </p>
                <ul className="mt-4 space-y-1">
                  {DEMO_STEPS.map((s, i) => (
                    <li
                      key={s.label}
                      className="stagger flex items-center gap-3 rounded-lg px-3 py-2 text-sm"
                      style={{ transitionDelay: `${0.25 + i * 0.18}s` }}
                    >
                      <span className="w-4 font-mono text-[10px] text-ink-faint">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {s.state === "done" && <Check className="h-4 w-4 shrink-0 text-success" />}
                      {s.state === "waiting" && (
                        <ShieldCheck className="h-4 w-4 shrink-0 animate-pulse text-warning" />
                      )}
                      {s.state === "pending" && (
                        <Loader2 className="h-4 w-4 shrink-0 text-ink-faint" />
                      )}
                      <span
                        className={
                          s.state === "done"
                            ? "text-ink-soft"
                            : s.state === "waiting"
                              ? "font-medium text-warning"
                              : "text-ink-faint"
                        }
                      >
                        {s.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Indice de scroll */}
        <div aria-hidden className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2">
          <div className="flex h-9 w-5 items-start justify-center rounded-full border border-line/80 p-1.5">
            <span className="h-2 w-[3px] animate-blink rounded-full bg-accent" />
          </div>
        </div>
      </section>

      {/* ── DEUX RÉGIMES ────────────────────────────────────────────────── */}
      <section className="border-t border-line bg-card/40">
        <div className="mx-auto max-w-page px-4 py-20 sm:px-6 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="hud-label">Un cerveau, deux vitesses</p>
            <h2 className="mt-3 font-display text-2xl font-bold text-ink sm:text-3xl">
              Du tac au tac à la mission complète
            </h2>
          </Reveal>
          <Reveal className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-2" delay={0.12}>
            <div className="hud-card p-7">
              <MessageSquare className="h-9 w-9 text-accent [filter:drop-shadow(0_0_8px_rgba(56,189,248,0.5))]" />
              <h3 className="mt-4 font-display text-lg font-semibold text-ink">
                Réponse instantanée
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                « Résume cette page », « traduis ma sélection », « explique ce tableau » —
                la réponse arrive en streaming, en moins d&apos;une seconde, sans quitter
                ta page. L&apos;assistant voit ce que tu vois.
              </p>
            </div>
            <div className="hud-card p-7">
              <Rocket className="h-9 w-9 text-accent [filter:drop-shadow(0_0_8px_rgba(56,189,248,0.5))]" />
              <h3 className="mt-4 font-display text-lg font-semibold text-ink">
                Mission d&apos;agent
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                « Lis la bdd affichée, croise-la avec mon Drive, fais-moi une prez Canva
                et envoie-la-moi » — il bascule tout seul en agent complet : plan,
                exécution live, validations humaines, re-planification si une étape échoue.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── SUPERPOUVOIRS ───────────────────────────────────────────────── */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-page px-4 py-20 sm:px-6 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="hud-label">Ce qu&apos;aucun chatbot ne fait</p>
            <h2 className="mt-3 font-display text-2xl font-bold text-ink sm:text-3xl">
              Il travaille là où tu travailles
            </h2>
          </Reveal>
          <Reveal className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" delay={0.12}>
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
            ].map((f, i) => (
              <div
                key={f.title}
                className="hud-card stagger group p-7 hover:-translate-y-0.5"
                style={{ transitionDelay: `${i * 0.12}s` }}
              >
                <f.icon className="h-9 w-9 text-accent [filter:drop-shadow(0_0_8px_rgba(56,189,248,0.5))]" />
                <h3 className="mt-4 font-display text-lg font-semibold text-ink">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{f.desc}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── APPS ────────────────────────────────────────────────────────── */}
      <section className="border-t border-line bg-card/40">
        <div className="mx-auto max-w-page px-4 py-12 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-semibold text-ink">
            Plus de 1 000 applications connectables
          </p>
          <p className="hud-label mt-2 text-center !text-ink-faint">
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
                      className="flex shrink-0 items-center gap-2.5 rounded-full border border-line bg-card px-4 py-2 text-sm font-medium text-ink-soft"
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
            <Reveal>
              <p className="hud-label">Contrôle total</p>
              <h2 className="mt-3 font-display text-2xl font-bold text-ink sm:text-3xl">
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
            </Reveal>
            <Reveal delay={0.15} className="hud-corners rounded-2xl border border-warning/30 bg-warning/5 p-6">
              <p className="hud-label !text-warning">Confirmation requise</p>
              <p className="mt-2 font-medium text-ink">
                Prompta veut : envoyer le formulaire fournisseur
              </p>
              <div className="mt-3 rounded-xl border border-line bg-card p-4 text-sm text-ink-soft">
                Devis retenu : Alpha SARL (2 340 € — le mieux-disant sur les 3 onglets
                comparés). Le formulaire est rempli, prêt à partir.
              </div>
              <div className="mt-4 flex gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-success px-4 py-2 text-sm font-semibold text-accent-ink">
                  <Check className="h-4 w-4" /> Autoriser
                </span>
                <span className="inline-flex items-center rounded-lg border border-line bg-card px-4 py-2 text-sm text-ink-soft">
                  Refuser
                </span>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ───────────────────────────────────────────────────── */}
      <section className="bg-hud-grid relative border-t border-line">
        <div aria-hidden className="bg-hud-halo pointer-events-none absolute inset-x-0 top-0 h-full" />
        <Reveal className="relative mx-auto max-w-page px-4 py-20 text-center sm:px-6 lg:px-8">
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
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-8 text-base font-semibold text-accent-ink shadow-glow transition-all hover:bg-accent-hover hover:shadow-glow-lg"
            >
              <Globe className="h-5 w-5" /> Installer Prompta partout
            </Link>
            <Link
              href="/quick"
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-card/70 px-8 text-base font-medium text-ink transition-all hover:border-accent/50 hover:shadow-glow-sm"
            >
              Essayer sans extension <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-6 font-mono text-xs tracking-wide text-ink-faint">
            Plans dès {PLANS.free.priceCents === 0 ? "0 €" : `${PLANS.free.priceCents / 100} €`}
            {" · "}BYOK = exécutions illimitées
          </p>
        </Reveal>
      </section>
    </div>
  );
}
