# Prompta

**L'assistant IA dans ton navigateur : il voit ton écran, agit sur tes apps, et tu valides.**

Prompta vit dans une extension (« Prompta partout ») : un panneau glisse à droite de n'importe quelle page. Il lit ce que tu vois — y compris tes onglets connectés (CRM, mails, dashboards) — répond au tac au tac, et bascule tout seul en **agent complet** pour les vraies missions : plan, exécution sur 1 000+ apps (Composio), pilotage du navigateur sous tes yeux, questions en cours de route, validation humaine sur chaque action sensible.

---

## Offres & rentabilité

Source de vérité : `lib/billing/plans.ts` (grille), `lib/billing/credits.ts` (markup), `lib/credit-packs.ts` (recharges). Détail complet : `docs/BUSINESS-PLAN.md`.

### La grille (3 offres — refonte 2026-07-24)

| | **Découverte** | **Illimité** ⭐ | **Pro** |
|---|---|---|---|
| Prix | **0 €** | **29 €/mois** | **99 €/mois** |
| Crédits IA inclus / mois | — (2 € offerts à l'inscription) | **35 €** | **120 €** |
| Agents gardés | 1 | **Illimités** | **Illimités** |
| Modèles (GPT, Claude, Gemini, Mistral) | ✓ | ✓ | ✓ |
| Multi-desk (postes sur un même compte) | 1 | 1 | **10** |
| Plafond de dépense mensuel (anti-abus) | 50 € | 70 € | 240 € |
| Report des crédits inclus | — | non | non |
| BYOK (tes clés = runs gratuits illimités) | ✓ | ✓ | ✓ |
| Support | — | Email standard | **Prioritaire + accompagnement** |

Au-delà de Pro (équipe, volume, SLA) : **sur devis** — pas de 4ᵉ carte publique.

**Positionnement** : Découverte fait entrer (extension + 2 € sans carte), Illimité est l'offre par défaut de l'usage quotidien (« plus de crédits que ton abonnement, agents illimités »), Pro monétise l'intensité (volume + multi-postes). Le BYOK reste gratuit sur tous les plans : c'est le moteur d'acquisition des techniciens, à coût variable nul.

### La rentabilité (invariant « com ≥ 20 % », codé et testé)

Les crédits sont débités avec un **markup ×1,6** sur le coût API réel (`MARKUP`, appliqué sur tous les chemins : missions, tac au tac, planification, replan, aiFills). Donc 1 € de crédits consommé = **0,625 € de coût API au maximum**.

**L'invariant** : même si un abonné consomme 100 % de ses crédits inclus, la marge nette reste ≥ 20 % du montant payé. Il est garanti par un plafond structurel — `MAX_CREDIT_GRANT_RATIO = 1,22` : **on n'accorde jamais plus de 1,22 € de crédits par euro réellement payé**. Le webhook Stripe borne chaque grant mensuel par `1,22 × invoice.amount_paid`, ce qui couvre aussi les factures legacy (anciens prix Starter/Scale), les prorata de changement de plan et les coupons. Vérifié par `tests/unit/plans.test.ts`.

Marges **au pire cas** (consommation 100 % des crédits, frais Stripe EU 1,5 % + 0,25 €) :

| Plan | Payé | Coût API max (crédits ÷ 1,6) | Frais Stripe | **Marge nette pire cas** |
|---|---|---|---|---|
| Illimité 29 € | 29,00 € | 21,88 € | 0,69 € | **6,44 € (22 %)** |
| Pro 99 € | 99,00 € | 75,00 € | 1,74 € | **22,27 € (22 %)** |

En pratique la consommation moyenne des crédits inclus est de 40-70 % → **marge réelle attendue 45-65 %**.

**Crédits inclus non reportables** (décision 2026-07-24, migration `0052`) : deux compartiments dans `user_credits` — `plan_credits_cents` (allocation mensuelle, **remplacée** à chaque facture, périme avec le cycle) et `balance_cents` (recharges achetées + bienvenue, **permanentes**). La dépense consomme l'allocation d'abord : un client ne perd jamais un crédit qu'il a payé à l'unité. C'est ce qui permet d'inclure plus de crédits que le prix du plan — le non-consommé retourne à la marge au lieu de s'accumuler en dette.

**Multi-desk** : `deskLimit` dans `plans.ts` (1 / 1 / 10). Engagement commercial en v1 — le verrou technique des postes n'est pas encore implémenté, c'est du fair-use.

**Plafond de dépense mensuel** (`lib/billing/spending-limits.ts`) : garde-fou anti-abus, pas un quota commercial. Il vaut `max(50 €, 2 × crédits inclus)` — 50 € en Découverte, 70 € en Illimité, 240 € en Pro — et couvre l'ensemble de la dépense du mois (allocation + recharges). Il existe pour qu'un agent parti en boucle ou un compte compromis ne puisse pas vider un solde ni faire exploser la facture API ; un abonné normal ne le touche jamais.

Autres flux de revenus : **recharges à la carte** (5/12/30/100 € — bonus jusqu'à +20 %, toujours sous le ratio 1,22 → marge ≥ 20 % garantie, ~24-37 % typique ; elles n'expirent jamais, c'est ce qui rend le non-report acceptable) ; **freemium** coûte au plus 1,25 € de coût API par signup (2 € offerts ÷ 1,6), consommés par une minorité d'inscrits.

Cockpit temps réel : `/admin` (MRR par plan, marge réelle coût API vs facturé, comptes à perte, circuit-breaker plateforme).

---

## Stack

| Couche | Technologie |
|--------|-------------|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind — DA « AI Core » (`docs/DESIGN-SYSTEM.md`) |
| Extension | Chrome/Chromium MV3 (`extension/`), portage Firefox (`manifest.firefox.json`), Safari préparé (`scripts/build-safari.sh`) |
| Backend | Routes API Next.js + Supabase (Postgres, Auth, RLS) — déployé sur Render (`render.yaml`) |
| Connecteurs | Composio (catalogue 1 000+ apps) + registre natif curaté (Gmail, Sheets, Slack…) |
| LLM | Passerelle multi-fournisseurs (OpenAI, Anthropic, Google, Mistral) — BYOK ou crédits plateforme |
| Paiements | Stripe (Checkout, Subscriptions, Tax) |
| Emails / erreurs | Resend · Sentry · Plausible (optionnel, sans cookie) |

---

## Comment ça marche (le cerveau)

**Deux régimes, une seule zone de saisie :**

1. **Tac au tac** — `/api/extension/instant` : un appel LLM streamé (SSE). Le modèle répond directement, ou émet la sentinelle `MISSION` → bascule automatique en régime agent. Débité des crédits (clé plateforme) ou gratuit (BYOK).
2. **Mission** — `/api/extension/execute` : le planificateur (`lib/extension/instant-agent.ts`) transforme l'ordre + le contexte (page active, onglets cochés, **historique de conversation**) en manifeste d'étapes, exécuté par l'orchestrateur (`lib/agent/orchestrator.ts`) via le worker (`worker/run-worker.ts`, filet `/api/cron/tick`).

**Doctrine de choix des sources** (dans le prompt du planificateur) : sous les yeux de l'utilisateur → `{{page_active}}`/`{{tab_N}}` ; dans une app non ouverte → `<app>.search` ; web public → `web_fetch`. L'hybride est le cas normal, l'historique tranche les ambiguïtés, l'écran gagne en cas de doute.

**Types d'étapes** (`lib/agent/schema.ts`) : `llm`, `tool` (web_search/web_fetch…), `action` (Composio/natif), `browser` (pilotage du navigateur, ciblage d'onglet via `tabHint`), `ask` (**question à l'utilisateur en cours de mission** — pause, réponse → `{{outputKey}}`), `approval` (validation humaine), `condition`, `parallel`, `retrieve`, `code`.

**Dialogue complet** : clarification avant plan (`clarify`), question en cours de route (`ask`), corrections après coup (« tu as oublié… » compris comme suite de mission grâce à l'historique envoyé par les 3 fronts).

**Garde-fous** : validation humaine avant toute écriture sensible (in-panel), connecteur manquant → 409 + boutons « Connecter » + **reprise automatique post-OAuth**, contenu de page traité comme donnée non fiable, plans invalides auto-réparés, replan borné après échec, idempotence des actions externes, reaper de runs bloqués.

**Billing étanche** : tout appel LLM sur clé plateforme est débité (markup ×1,6) — tac au tac, planification, replan, aiFills, missions (hold/settle). Plafond mensuel par plan, circuit-breaker plateforme, com ≥ 20 % garantie au pire cas (plafond structurel : ≤ 1,22 € de crédits accordés par € payé — voir « Offres & rentabilité »). Cockpit rentabilité : `/admin` (`lib/admin/kpis.ts`).

---

## Démarrage local

```bash
npm install
cp .env.example .env.local   # puis remplir (voir ci-dessous)
npm run dev                  # http://localhost:3000
```

Vérifications :

```bash
npx tsc --noEmit && npm run lint && npm run test:unit && npm run build
```

QA de bout en bout (endpoints réels, session mintée — nécessite le serveur local lancé) :

```bash
npx tsx scripts/qa-extension-flows.ts    # 7 flux de base (tac au tac, clarify, 409, agent, validation)
npx tsx scripts/qa-omniscience.ts        # 18 scénarios multi-onglets, sources, dialogue mi-mission
# Clé OpenAI à sec ? QA_MODEL=claude-sonnet-4-6 npx tsx scripts/qa-omniscience.ts
```

### Worker

```bash
npm run worker   # en prod : Background Worker Render (voir render.yaml)
```

---

## Extension « Prompta partout »

- Code dans `extension/` : `content.js` (panneau Shadow DOM + pilotage in-page), `bg.js` (service worker : réseau avec session, file de pilotage, check de mise à jour), `popup.*`.
- **Packaging** : `node scripts/pack-extension.mjs` (lancé au prebuild) → `public/downloads/prompta-everywhere.zip` (Chrome) + `prompta-firefox.zip` (manifest Gecko).
- **Publication stores** : guides pas-à-pas dans `docs/CHROME-WEB-STORE.md` et `docs/BROWSER-PORTS.md` (Firefox/AMO, Safari/Xcode). Une fois publié, renseigner sur Render `NEXT_PUBLIC_CHROME_STORE_URL` / `NEXT_PUBLIC_FIREFOX_ADDON_URL` : la page `/prompta-partout` bascule seule sur « Ajouter à Chrome/Firefox ».
- Un ZIP hors store ne s'auto-met pas à jour (règle navigateur) : l'extension compare sa version à `/api/extension/version` et affiche un bandeau « mise à jour disponible ». **Penser à bumper `version` dans LES DEUX manifests à chaque livraison.**

---

## Variables d'environnement

Copier `.env.example` → `.env.local` (dev) et renseigner **aussi** sur Render (prod).

### Obligatoires

| Variable | Usage |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + serveur Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Routes API admin/cron (jamais côté client) |
| `ENCRYPTION_KEY` | Chiffrement des clés/jetons utilisateur (`openssl rand -hex 32`) |
| `NEXT_PUBLIC_APP_URL` | URLs canoniques, OAuth callbacks, emails |

### Connecteurs & runtime

| Variable | Usage |
|----------|-------|
| `COMPOSIO_API_KEY` | Connecteurs Composio (1 000+ apps) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth natif Gmail/Sheets (secours) |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | OAuth natif Slack |
| `PLATFORM_OPENAI_KEY` / `PLATFORM_ANTHROPIC_KEY` / `PLATFORM_GOOGLE_KEY` / `PLATFORM_MISTRAL_KEY` | Clés plateforme (mode crédits) |
| `PLATFORM_SERPER_KEY` | Recherche web des agents |
| `UNRESTRICTED_EMAILS` | Comptes test/QA exemptés de crédits & quotas (CSV) |

### Paiements, stores & divers

| Variable | Usage |
|----------|-------|
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Plans & packs de crédits |
| `NEXT_PUBLIC_CHROME_STORE_URL` / `NEXT_PUBLIC_FIREFOX_ADDON_URL` | Bascule la page d'install sur les stores |
| `RESEND_API_KEY` · `SENTRY_DSN` · `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Emails · erreurs · audience (sans cookie) |
| `CRON_SECRET` | Protège `/api/cron/*` |

> **Sécurité :** jamais de préfixe `NEXT_PUBLIC_` sur un secret serveur.

---

## Migrations Supabase

`supabase/migrations/` fait foi — exécuter dans l'ordre (SQL Editor ou `supabase db push`). Après migration, se passer admin/QA :

```sql
update profiles set is_admin = true, unrestricted_usage = true where username = 'TON_USERNAME';
```

---

## Structure du repo

```
extension/              # Prompta partout (MV3) : content.js, bg.js, popup, manifests Chrome+Firefox
app/
  (marketing)/          # Landing (hero AI Core), pricing, cas-usage (SEO), prompta-partout, aide
  (auth)/               # Login, signup, onboarding (→ installation extension)
  quick/                # Assistant autonome hors extension (même cerveau)
  dashboard/            # Runs & agents gardés, validations, connexions, abonnements, crédits
  admin/                # Cockpit rentabilité (KPI), agents ops, santé worker
  api/                  # extension/* (instant, execute, save-agent…), run/*, approvals, stripe, cron
components/
  marketing/            # AiCoreScene (hero particules), Reveal, démos
  run/                  # Console de run, timeline, modale de validation
lib/
  extension/            # Planificateur (instant-agent), replan
  agent/                # Schema, orchestrateur, browser-pilot, approvals, outils
  billing/              # Plans, crédits (markup), entitlements, plafonds, circuit-breaker
  admin/                # KPI rentabilité
  connectors/ composio/ # Exécution & catalogue d'actions
  llm/                  # Passerelle multi-modèles, pricing tokens
worker/                 # run-worker.ts (npm run worker)
scripts/                # pack-extension, build-safari, qa-extension-flows, qa-omniscience…
docs/                   # DESIGN-SYSTEM, CHROME-WEB-STORE, BROWSER-PORTS, BUSINESS-PLAN…
supabase/migrations/    # SQL
tests/unit/             # 365 tests (contrat, résolveur, billing, conformance…)
```

---

## Admin & légal

- `/admin` : burn du jour vs plafond, MRR par plan, marge réelle (coût API vs facturé), comptes à perte, alertes. `/admin/agents`, `/admin/worker-health`. Accès : `profiles.is_admin`.
- Éditeur : **Puccini EI** (SIREN 932 699 697) — mentions légales `/legal/mentions`, TVA non applicable art. 293 B CGI. Pas de bannière cookies : uniquement des cookies essentiels (session Supabase).

## Licence

Propriétaire — Prompta © 2026
