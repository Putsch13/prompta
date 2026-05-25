# Prompta

Marketplace de prompts, agents et workflows IA — avec exécution sur plateforme (BYOK), modération, paiements Stripe Connect, espace admin et 7 agents IA opérationnels.

---

## Stack

| Couche | Technologie |
|--------|-------------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend | Routes API Next.js + Supabase (Postgres, Auth, Storage, RLS) |
| Paiements | Stripe Connect, Checkout, Subscriptions, Tax |
| Emails | Resend |
| Analytics | PostHog |
| Monitoring | Sentry |
| Agents admin | Claude Sonnet (Anthropic API) + mode sandbox |

---

## Démarrage local

```bash
npm install
cp .env.example .env.local   # puis remplir les variables (voir ci-dessous)
npm run dev                    # http://localhost:3000
```

Vérifications :

```bash
npx tsc --noEmit
npm run lint
npm run build
```

---

## Variables d'environnement

Copier `.env.example` → `.env.local` (dev) et renseigner **aussi** sur Render (prod).

### Obligatoires (app principale)

| Variable | Où la trouver | Usage |
|----------|---------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | Client + serveur |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API | Client |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API | Routes API admin/cron (jamais côté client) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → Developers | Checkout client |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers | Paiements serveur |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks (endpoint prod) | Vérification webhooks |
| `STRIPE_CONNECT_CLIENT_ID` | Stripe Connect → Settings | Onboarding créateurs |
| `RESEND_API_KEY` | Resend Dashboard | Reçus email |
| `SENTRY_DSN` | Sentry → Project Settings | Erreurs prod |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog → Project Settings | Analytics |
| `NEXT_PUBLIC_APP_URL` | Ton domaine | URLs canoniques, emails, OG |

### Runtime utilisateur (BYOK)

| Variable | Usage |
|----------|-------|
| `ENCRYPTION_KEY` | Chiffrement des clés API utilisateur (`lib/crypto.ts`). Chaîne longue aléatoire. Fallback : `SUPABASE_SERVICE_ROLE_KEY` si absent. |
| `PLATFORM_OPENAI_KEY` | *(Optionnel)* Quota gratuit 20 runs/jour sans clé utilisateur |
| `PLATFORM_ANTHROPIC_KEY` | *(Optionnel)* Idem |
| `PLATFORM_GOOGLE_KEY` | *(Optionnel)* Idem |
| `PLATFORM_MISTRAL_KEY` | *(Optionnel)* Idem |

### Agents admin (7 agents IA)

| Variable | Usage |
|----------|-------|
| `ANTHROPIC_API_KEY` | Appels Claude en mode **live** (`lib/agents/anthropic.ts`) |
| `CRON_SECRET` | Protège `/api/cron/tick`, `/api/cron/badges`, `/api/cron/scheduled-runs` |

Générer un secret : `openssl rand -hex 32`

> **Sécurité :** jamais de préfixe `NEXT_PUBLIC_` sur les secrets serveur.

---

## Migrations Supabase

Exécuter **dans l'ordre** via Supabase → SQL Editor (ou `supabase db push`).

| # | Fichier | Contenu |
|---|---------|---------|
| 0001 | `0001_init.sql` | Schéma de base |
| 0002 | `0002_profile_trigger.sql` | Trigger profil à l'inscription |
| 0003 | `0003_search_vector_trigger.sql` | Recherche full-text |
| 0004 | `0004_admin_role.sql` | `is_admin`, modération RLS |
| 0005 | `0005_purchase_tax.sql` | `tax_cents` sur achats |
| 0006 | `0006_listing_stats.sql` | Vue stats listings |
| 0007 | `0007_seed_badges.sql` | Badges de base |
| 0008 | `0008_moderation_actions.sql` | Audit modération |
| 0009 | `0009_api_keys.sql` | Clés API chiffrées (BYOK) |
| 0010 | `0010_runs.sql` | Runs utilisateur + quota gratuit |
| 0011 | `0011_subscriptions.sql` | Abonnements agents |
| 0012 | `0012_organizations.sql` | B2B organisations |
| 0013 | `0013_scheduled_runs.sql` | Planification + Prompta Pro (table) |
| 0014 | `0014_rename_listing_agent_runs.sql` | Renommage conflit `agent_runs` |
| 0015 | `0015_admin_agents.sql` | 7 agents, budget, personas, KPI |
| 0016 | `0016_admin_agents_sandbox.sql` | Mode sandbox + `purge_sandbox()` |

Après migration, te passer admin :

```sql
update profiles set is_admin = true where username = 'TON_USERNAME';
```

---

## Fonctionnalités implémentées (code)

### Marketplace & UX
- Accueil, explore, fiches listing (ISR + JSON-LD + OG dynamiques)
- Pages catégories `/c/[slug]`
- Profil builder `/u/[username]` + fiche synthèse `/u/[username]/synthese`
- Design system (`components/ui.tsx`, `PromptCard.tsx`)
- Double mode **Copier / Lancer** (`RunPanel`) sur les fiches prompt
- Wizard création builder (`CreateWizard` — 7 étapes)
- Assistant clés API (`UserSetupWizard`) + `/dashboard/connexions`

### Modération & sécurité
- Back-office `/admin/moderation` (approve / reject / signalements)
- Filtres contenu + scan secrets/bundles
- Rate limiting middleware
- Pages légales `/legal/terms`, `/legal/privacy` (gabarits)

### Paiements
- Stripe Connect (KYC créateur)
- Checkout one-shot + Stripe Tax (TVA)
- Abonnements agents (`/api/stripe/subscribe`)
- Customer Portal (`/dashboard/abonnements`)
- Reçus email (Resend)

### Runtime
- Passerelle LLM multi-fournisseurs (`lib/llm/`)
- Exécution prompt SSE (`/api/run/prompt`)
- Orchestrateur agent déclaratif (`lib/agent/`)

### Admin & agents IA
- Dashboard KPI `/admin`
- Centre de contrôle `/admin/agents` (sandbox/live, budget, validation)
- 7 agents : `prompt_factory`, `linkedin_publisher`, `seo_content`, `moderation`, `email_crm`, `analytics_pricing`, `affiliate`
- Cron `/api/cron/tick` (planification horaire)

### B2B (fondations)
- Tables `organizations`, `org_members`, `org_listings`
- Page espace org `/org/[slug]` (squelette)

---

## Audit TODO (état au 25/05/2026)

Légende : ✅ code livré · ⚠️ partiel · ❌ manuel / non fait

### TODO-CURSOR-v2 (revue CTO)

| Phase | Statut | Détail |
|-------|--------|--------|
| **0 — Sécuriser** | ⚠️ | Modération, reskin, rate limit ✅. Validation juridique CGU ❌ (juriste) |
| **1 — Runtime** | ⚠️ | Gateway, BYOK, RunPanel, CreateWizard ✅. Worker séparé Render ❌. Checklist onboarding dashboard ❌. Historique runs UI ❌. Éditeur visuel agent (drag-drop) ❌ |
| **2 — Monétisation** | ⚠️ | Checkout, tax, abonnements, webhooks ✅. MRR dans payouts ❌. Crédits plateforme ❌. Dunning = statut `past_due` seulement |
| **3 — Croissance & B2B** | ⚠️ | OG, synthèse, badges cron, SEO ✅. Import marketplace→org ❌. SSO B2B ❌. Abo sièges Stripe ❌ |
| **4 — Industrialisation** | ❌ | Tables `scheduled_runs` / `platform_subscriptions` ✅. UI Prompta Pro ❌. E2B/Modal ❌. Déploiement prod ❌. Tests e2e ❌ |

### ADMIN_AGENTS_PLAN (7 agents)

| Sprint | Statut | Détail |
|--------|--------|--------|
| 1 — BDD | ⚠️ | Migrations 0014–0016 ✅ en repo. **Exécution Supabase ❌** |
| 2 — Env | ⚠️ | Code ✅. `ANTHROPIC_API_KEY` + `CRON_SECRET` ❌ à renseigner |
| 3 — Agents | ✅ | 7 agents + registre |
| 4 — API | ✅ | run / approve / sandbox / cron tick |
| 5 — UI admin | ✅ | KPI + centre de contrôle + lien Header |
| 6 — Personas | ⚠️ | Script ✅. **`npx tsx scripts/seed-personas.ts` ❌** |
| 7 — Test sandbox | ❌ | Tests manuels à faire |
| 8 — Cron Render | ❌ | Cron job Render à configurer |

---

## Configuration manuelle — checklist

### 1. Supabase (priorité 1)

1. **Appliquer les migrations** 0001 → 0016 dans SQL Editor (dans l'ordre).
2. **Te passer admin** :
   ```sql
   update profiles set is_admin = true where username = 'TON_USERNAME';
   ```
3. **Vérifier agents admin** :
   ```sql
   select slug, is_enabled from agent_definitions;  -- 7 lignes, tous false
   select mode from agent_budget where id = 1;      -- 'sandbox'
   ```
4. **Activer Point-in-Time Recovery** (Settings → Backups) en prod.
5. **Seed personas** (une fois migrations OK) :
   ```bash
   npx tsx scripts/seed-personas.ts
   ```

### 2. `.env.local` + Render (priorité 1)

Renseigner toutes les variables du tableau ci-dessus.

Minimum pour tester les agents admin :
```bash
ANTHROPIC_API_KEY=sk-ant-...
CRON_SECRET=<openssl rand -hex 32>
ENCRYPTION_KEY=<openssl rand -hex 32>
```

### 3. Stripe (priorité 2)

1. **Mode test** : clés test + webhook `checkout.session.completed`, `account.updated`, `charge.refunded`, `customer.subscription.*`, `invoice.*`
2. Webhook URL : `https://TON-DOMAINE/api/webhooks/stripe`
3. **Stripe Tax** : activer dans Dashboard
4. **Customer Portal** : activer dans Stripe → Settings → Billing
5. **Mode live** (avant lancement) : remplacer toutes les clés + recréer webhooks prod

### 4. Resend (priorité 2)

1. Créer compte + domaine vérifié
2. `RESEND_API_KEY` + configurer l'expéditeur dans `lib/email.ts`

### 5. Render — Web Service (priorité 2)

1. Connecter le repo GitHub
2. Build : `npm run build` · Start : `npm run start`
3. Copier **toutes** les variables d'env
4. Domaine custom + HTTPS

### 6. Render — Cron Jobs (priorité 3)

| Job | Schedule | Commande |
|-----|----------|----------|
| Agents admin | `0 * * * *` | `curl -sS -H "Authorization: Bearer $CRON_SECRET" https://TON-DOMAINE/api/cron/tick` |
| Badges | `0 3 * * *` | `curl -sS -H "x-cron-secret: $CRON_SECRET" -X POST https://TON-DOMAINE/api/cron/badges` |
| Scheduled runs | `*/15 * * * *` | `curl -sS -H "x-cron-secret: $CRON_SECRET" -X POST https://TON-DOMAINE/api/cron/scheduled-runs` |

### 7. Sentry + PostHog (priorité 3)

- Créer projets, renseigner `SENTRY_DSN` et `NEXT_PUBLIC_POSTHOG_KEY`
- Configurer alertes erreurs (Sentry) et funnels (PostHog dashboard)

### 8. Agents admin — mise en route (priorité 3)

1. Aller sur `/admin/agents` → vérifier bandeau **🧪 MODE SANDBOX**
2. Activer `prompt_factory` :
   ```sql
   update agent_definitions set is_enabled = true where slug = 'prompt_factory';
   ```
3. Cliquer **▶ Lancer** → valider/rejeter outputs sandbox
4. Quand prêt : **→ Passer en LIVE** (bouton admin)
5. Activer les autres agents **un par un**
6. Configurer plannings :
   ```sql
   update agent_schedules set is_enabled = true, hours = '{19,20,21}'
   where agent_slug = 'prompt_factory';
   ```

### 9. Juridique (priorité 4)

- Faire valider `/legal/terms` et `/legal/privacy` par un juriste
- Compléter les placeholders (adresse, DPO, etc.)

### 10. Lancement (priorité 4)

- Amorcer 100–200 listings de qualité
- Tests manuels : inscription → dépôt → modération → achat → téléchargement → run prompt
- Passer Stripe en live

---

## Structure du repo

```
app/                    # Pages Next.js (App Router)
  admin/                # KPI, agents, modération
  api/                  # Routes API (stripe, run, agents, cron…)
  dashboard/            # Espace builder
  listing/              # Fiches prompt
agents/                 # 7 agents IA (registre admin)
lib/
  agents/               # Wrapper Anthropic, budget, runner (admin)
  agent/                # Orchestrateur runtime utilisateur
  llm/                  # Passerelle multi-modèles
  admin/                # Guard admin
components/             # UI réutilisable
delivery/               # Sources originales (référence, hors build)
scripts/                # seed-personas.ts
supabase/migrations/    # 16 migrations SQL
```

---

## Plans de travail

| Fichier | Description |
|---------|-------------|
| [TODO-CURSOR-v2.md](./TODO-CURSOR-v2.md) | Plan produit CTO (Phases 0–4) — **référence principale** |
| [ADMIN_AGENTS_PLAN.md](./ADMIN_AGENTS_PLAN.md) | Plan admin & 7 agents (Sprints 1–8) |
| [audit.md](./audit.md) | Document directeur stratégique |
| [prompta-revue-cto.md](./prompta-revue-cto.md) | Revue CTO détaillée |

---

## Routes admin utiles

| URL | Description |
|-----|-------------|
| `/admin` | Dashboard KPI |
| `/admin/agents` | Centre de contrôle agents (sandbox, budget, validation) |
| `/admin/moderation` | Modération listings |

Accessible uniquement si `profiles.is_admin = true`.

---

## Licence

Propriétaire — Prompta © 2026
