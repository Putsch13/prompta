import type { Metadata } from "next";
import {
  Bot,
  Play,
  Bug,
  Plug,
  Hammer,
  Gift,
  Check,
  ShieldCheck,
  Loader2,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { B2BSection } from "@/components/marketing/B2BSection";
import { PLANS } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prompta — Crée ton agent IA sans code, connecté à 1000+ apps",
  description:
    "Construis un agent IA en décrivant ton objectif : Gmail, Sheets, Slack, Canva, Notion… Il travaille pour de vrai, tu valides les actions sensibles. Premier agent gratuit + 2 € de crédits IA offerts.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Prompta — tes agents IA en production, sans code",
    description:
      "Décris ton objectif, le copilote construit l'agent. 1000+ apps, validation humaine, logs en direct. Gratuit pour démarrer.",
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
  { label: "Lecture du Drive — 3 fichiers trouvés", state: "done" },
  { label: "Analyse Head of Sales (GPT-5.4)", state: "done" },
  { label: "Création de la présentation Canva", state: "done" },
  { label: "Validation humaine — en attente de ton feu vert", state: "waiting" },
  { label: "Envoi du récap par email", state: "pending" },
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
              <Gift className="h-4 w-4" />
              1 agent hébergé gratuit · 2 € de crédits IA offerts · sans carte bancaire
            </p>
            <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-ink sm:text-6xl">
              Ton agent IA travaille.
              <br />
              <span className="bg-gradient-to-r from-accent to-violet-500 bg-clip-text text-transparent">
                Toi, tu valides.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-ink-soft">
              Décris ton objectif en une phrase : le copilote construit l&apos;agent, le connecte
              à tes vraies apps — Gmail, Sheets, Canva, Notion… — et l&apos;exécute pour de vrai.
              Chaque action sensible attend ton feu vert, chaque étape est visible en direct.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/dashboard/new"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-7 text-base font-semibold text-white shadow-lg shadow-accent/25 transition-all hover:bg-accent-hover hover:shadow-accent/35"
              >
                <Bot className="h-5 w-5" />
                Créer mon agent gratuit
              </Link>
              <Link
                href="/pricing"
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-card px-7 text-base font-medium text-ink transition-colors hover:border-accent"
              >
                Voir les tarifs
              </Link>
            </div>
          </div>

          {/* ── Console live (mock produit) ── */}
          <div className="mx-auto mt-14 max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#101019] shadow-2xl shadow-accent/10">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
              <span className="ml-3 text-xs font-medium text-white/60">
                Audit commercial hebdo — exécution en direct
              </span>
              <span className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> LIVE
              </span>
            </div>
            <ul className="space-y-1 p-4">
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
      </section>

      {/* ── APPS ────────────────────────────────────────────────────────── */}
      <section className="border-t border-line bg-card">
        <div className="mx-auto max-w-page px-4 py-12 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-semibold text-ink">
            Plus de 1 000 applications connectables pour vos agents
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

      {/* ── PARCOURS ────────────────────────────────────────────────────── */}
      <section className="border-t border-line bg-card2/50">
        <div className="mx-auto max-w-page px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-bold uppercase tracking-wider text-accent">
              Le parcours en 4 temps
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-ink sm:text-3xl">
              Comme Render, mais pour les agents
            </h2>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Hammer,
                step: "01",
                title: "Construire",
                desc: "Décris ton objectif : le copilote IA dessine l'arborescence des étapes et te guide nœud par nœud.",
              },
              {
                icon: Plug,
                step: "02",
                title: "Connecter",
                desc: "Gmail, Sheets, Slack, Notion, Canva… Branche un compte en un clic, sans copier d'ID.",
              },
              {
                icon: Play,
                step: "03",
                title: "Lancer",
                desc: "Exécution réelle par défaut. Étapes, parallélisme et validations humaines intégrées.",
              },
              {
                icon: Bug,
                step: "04",
                title: "Superviser",
                desc: "Console live, dossier de mission, erreurs traduites en actions — et une IA qui répare les runs.",
              },
            ].map((s) => (
              <div
                key={s.step}
                className="group relative rounded-2xl border border-line bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5"
              >
                <span className="font-display text-sm font-bold text-ink-faint">{s.step}</span>
                <s.icon className="mt-3 h-9 w-9 text-accent" />
                <h3 className="mt-4 font-display text-lg font-semibold text-ink">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.desc}</p>
              </div>
            ))}
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
                  "Validation humaine avant chaque action sensible — tu relis, corriges ou refuses, même par email.",
                  "Dossier de mission complet : chaque entrée, chaque sortie, chaque email envoyé est tracé.",
                  "Jetons OAuth chiffrés, tes clés API jamais exposées.",
                  "Une IA de réparation qui diagnostique les échecs et relance le run corrigé.",
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
                Validation requise
              </p>
              <p className="mt-2 font-medium text-amber-950">
                « Audit commercial hebdo » attend ton feu vert
              </p>
              <div className="mt-3 rounded-xl border border-amber-200 bg-white p-4 text-sm text-ink-soft">
                Synthèse : le CA de la semaine progresse de 12 %. Trois clients à relancer en
                priorité : Alpha SARL, Studio K, Maison Verne…
              </div>
              <div className="mt-4 flex gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
                  <Check className="h-4 w-4" /> Valider et continuer
                </span>
                <span className="inline-flex items-center rounded-lg border border-line bg-white px-4 py-2 text-sm text-ink-soft">
                  Corriger avec l&apos;IA
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING TEASER ──────────────────────────────────────────────── */}
      <section className="border-t border-line bg-card2/50">
        <div className="mx-auto max-w-page px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
              Gratuit pour démarrer, simple pour grandir
            </h2>
            <p className="mt-3 text-ink-soft">
              BYOK sur tous les plans : tes propres clés API = exécutions illimitées.
            </p>
          </div>
          <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-3">
            {(["free", "starter", "pro"] as const).map((id) => {
              const p = PLANS[id];
              return (
                <Link
                  key={id}
                  href="/pricing"
                  className={`rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                    p.highlight ? "border-accent ring-1 ring-accent/30" : "border-line"
                  }`}
                >
                  <p className="font-display font-bold text-ink">{p.label}</p>
                  <p className="mt-2">
                    <span className="font-display text-3xl font-bold text-ink">
                      {p.priceCents === 0 ? "0 €" : `${p.priceCents / 100} €`}
                    </span>
                    <span className="text-sm text-ink-faint"> / mois</span>
                  </p>
                  <p className="mt-2 text-sm text-ink-soft">{p.tagline}</p>
                </Link>
              );
            })}
          </div>
          <p className="mt-8 text-center">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
            >
              Comparer tous les plans <ArrowRight className="h-4 w-4" />
            </Link>
          </p>
        </div>
      </section>

      {/* ── CTA FINAL ───────────────────────────────────────────────────── */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-page px-4 py-20 text-center sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl font-bold text-ink">
            Ton premier agent en production dans 10 minutes
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-soft">
            Décris ce que tu veux automatiser — le copilote s&apos;occupe du reste.
          </p>
          <Link
            href="/dashboard/new"
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-8 text-base font-semibold text-white shadow-lg shadow-accent/25 hover:bg-accent-hover"
          >
            <Bot className="h-5 w-5" /> Commencer gratuitement
          </Link>
        </div>
      </section>

      <B2BSection />
    </div>
  );
}
