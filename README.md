# Prompta

**La plateforme pour créer, lancer et débugger tes agents IA — comme Render, mais pour les agents.**

On construit un agent visuellement, on le connecte à ses outils (Gmail, Google Sheets, Slack, Telegram, Canva…), on le lance pour de vrai et on suit chaque étape dans les logs. Monétisation par **abonnement par agent en production** (les comptes test/QA sont exemptés via `UNRESTRICTED_EMAILS`).

---

## Stack

| Couche | Technologie |
|--------|-------------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend | Routes API Next.js + Supabase (Postgres, Auth, Storage, RLS) |
| Connecteurs | Composio (défaut) + connecteurs natifs OAuth en secours |
| LLM | Passerelle multi-fournisseurs (OpenAI, Anthropic, Google, Mistral) — BYOK ou crédits plateforme |
| Paiements | Stripe (Checkout, Subscriptions, Connect, Tax) |
| Emails | Resend · Analytics PostHog · Monitoring Sentry |

---

## Concepts clés

- **Agent** : un manifeste déclaratif d'étapes (`llm`, `tool`, `connector`, `parallel`, validations humaines). Source de vérité dans `lib/agent/`.
- **Contrat d'agent** (`lib/agent/contract.ts`) : l'interface de l'agent (entrées, ressources, secrets) **dérivée uniquement de ses étapes**. Plus de listes parallèles à maintenir.
- **Résolveur** (`lib/agent/resolve-interface.ts`) : décide « qui fournit quoi / quand / avec quel widget » selon la phase (`build`, `sell`, `run`, `preflight`). Consommé par l'orchestrateur, le RunPanel, le NodeInspector et la publication.
- **Provider-aware** : une connexion peut être **native** (OAuth direct) ou **Composio**. L'exécution et le listing de ressources sont routés en conséquence (`lib/connectors/execute.ts`, `lib/connectors/list-resources.ts`) pour éviter les erreurs 401 et les boucles de reconnexion.
- **Picker de ressources** (`components/connectors/ResourceSelect.tsx`) : liste automatiquement les ressources d'un compte connecté (feuilles, salons…) avec repli « coller un ID ». Disponible dans le builder et dans le masque de run.

---

## Démarrage local

```bash
npm install
cp .env.example .env.local   # puis remplir les variables (voir ci-dessous)
npm run dev                  # http://localhost:3000
```

Vérifications :

```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run build
```

---

## Variables d'environnement

Copier `.env.example` → `.env.local` (dev) et renseigner **aussi** en prod (Render).

### Obligatoires

| Variable | Usage |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + serveur Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Routes API admin/cron (jamais côté client) |
| `ENCRYPTION_KEY` | Chiffrement des secrets/clés utilisateur (`openssl rand -hex 32`) |
| `NEXT_PUBLIC_APP_URL` | URLs canoniques, OAuth callbacks, emails |

### Connecteurs & runtime

| Variable | Usage |
|----------|-------|
| `COMPOSIO_API_KEY` | Active Composio comme provider de connecteurs par défaut (recommandé) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth natif Gmail / Google Sheets (secours si pas de Composio) |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | OAuth natif Slack |
| `PLATFORM_OPENAI_KEY` / `PLATFORM_ANTHROPIC_KEY` / `PLATFORM_GOOGLE_KEY` / `PLATFORM_MISTRAL_KEY` | *(optionnel)* clés plateforme (crédits / quota gratuit) |
| `PLATFORM_SERPER_KEY` | *(optionnel)* recherche web pour les agents |
| `UNRESTRICTED_EMAILS` | Comptes test/QA exemptés de crédits & quota (CSV d'emails) |

### Paiements & cron

| Variable | Usage |
|----------|-------|
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Abonnements & paiements |
| `STRIPE_CONNECT_CLIENT_ID` | Onboarding des créateurs (revenus) |
| `RESEND_API_KEY` · `SENTRY_DSN` · `NEXT_PUBLIC_POSTHOG_KEY` | Emails · erreurs · analytics |
| `CRON_SECRET` | Protège les endpoints `/api/cron/*` |

> **Sécurité :** jamais de préfixe `NEXT_PUBLIC_` sur un secret serveur.

---

## Migrations Supabase

Exécuter **dans l'ordre** via Supabase → SQL Editor (ou `supabase db push`). Le dossier `supabase/migrations/` fait foi (de `0001_init.sql` jusqu'aux migrations connecteurs/contrat, ex. `0040_agent_contract.sql`).

Te passer admin / compte test après migration :

```sql
update profiles set is_admin = true, unrestricted_usage = true where username = 'TON_USERNAME';
```

---

## Exécution des agents (runtime)

1. **Build** — `/dashboard/new` puis l'éditeur (`components/builder/`). Les entrées requises sont dérivées des étapes (contrat).
2. **Connexions** — `/dashboard/connexions` : brancher Gmail, Sheets, Slack… Le picker liste ensuite les ressources sans copier d'ID.
3. **Run** — bouton **Lancer** = exécution réelle (`dryRun: false`, `async: true`). **Aperçu** = exécution à blanc explicite.
4. **Debug** — `/dashboard/runs` : vue par agent (sélection d'un agent → ses runs, logs par étape et erreurs), erreurs traduites en actions concrètes (`lib/agent/error-map.ts`).

> Éditer un agent depuis la bibliothèque (`/dashboard/contenus`) rouvre son arborescence dédiée ; le manifeste complet est préservé à chaque nouvelle version.

### Dépannage Google (403 « autorisation manquante »)

Un 403 sur `sheets.read`/Drive vient quasi toujours des **scopes OAuth** de l'auth config Composio. Les scopes requis sont désormais fixés à la création **et** réalignés sur les configs existantes (`lib/composio/connect.ts`, `TOOLKIT_SCOPES`). Après ce correctif, **reconnectez Google** une fois pour que le nouveau jeton porte le scope `spreadsheets`. Causes restantes possibles : la feuille n'est pas partagée avec le compte connecté, ou l'app OAuth managed Composio n'autorise pas le scope (fallback automatique sans scope).

### Worker

Les runs en attente sont traités par :

```bash
npm run worker
```

En prod : un **Background Worker** Render avec `npm run worker`. Filet de sécurité : `/api/cron/tick` traite aussi quelques runs pending à chaque invocation.

---

## Connecteurs : catalogue dynamique (300+) + registre natif

Deux niveaux complémentaires :

- **Catalogue Composio (300+ apps)** — exposé dynamiquement, **sans code par app**. Le builder d'agent (`NodeInspector`) liste tous les toolkits Composio (`/api/composio/toolkits`) et, à la sélection, toutes leurs actions avec leur schéma d'entrées (`/api/composio/tools?toolkit=…`, `lib/composio/catalog.ts`). Le schéma de l'outil est **snapshoté** sur l'étape (`inputsSchema`, voir `lib/agent/schema.ts`) pour que contrat/résolveur/exécution fonctionnent sur n'importe quel outil (`lib/connectors/action-inputs.ts`). L'exécution route directement les slugs `UPPER_SNAKE` vers Composio (`lib/connectors/execute.ts`).
- **Registre natif curaté** — pour Gmail/Sheets/Slack… une UX soignée (libellés FR, ressources listables, defaults). Voir **[docs/ADD-CONNECTOR.md](./docs/ADD-CONNECTOR.md)** :
  1. Déclarer le connecteur et ses actions dans `lib/connectors/registry.ts` (chaque entrée requise a un `kind`, un `help`, un `placeholder` ; pas de valeur magique type `"*"`).
  2. Déclarer les types de ressources listables dans `lib/connectors/resource-types.ts`.
  3. Le validateur `lib/connectors/registry-conformance.ts` (testé en CI) refuse toute définition non conforme.

Le registre natif est **prioritaire** sur le catalogue (même `id`) ; toute autre app passe par le catalogue dynamique.

### Picker de ressources universel

Tout paramètre `*_id` d'un toolkit Composio devient une **ressource listable** (type synthétique `composio:<toolkit>:<param>`, `lib/connectors/resource-types.ts`). Au moment du listing, `lib/composio/discover-list-action.ts` inspecte les outils du toolkit et choisit la meilleure action « lister/rechercher » (score sur verbes `LIST/SEARCH/…`, nom de ressource, nombre d'entrées requises), l'exécute, puis parse la sortie via un parseur récursif générique (`parseComposioResourceList`). Aucun candidat crédible → repli sur la saisie manuelle d'ID.

### Wizard co-construit avec l'IA

L'étape « Co-construire » (`components/builder/canvas/GuidedBuilder.tsx`) place l'arborescence en grand puis un **Copilote** qui guide nœud par nœud. La complétude est calculée de façon **déterministe** (`lib/builder/agent-readiness.ts`, sans dépendre du JSON d'un LLM) : par nœud, ce qui manque (connecteur, paramètre requis, prompt, condition). Le copilote propose des **actions fiables** (« Demander à l'abonné », « Générer par IA », « Valeur fixe ») et un **champ libre** qui passe par le moteur d'édition de plan (`/api/builder/edit-plan`). Boutons : mode manuel ↔ guidé, ajouter un nœud, tout compléter par IA, évaluer la progression. Quand tout est prêt → CTA « Lancer le test ».

### Champs en IA (génération automatique)

Sur un paramètre en **champ libre**, le builder propose « Remplir par IA » (`components/builder/canvas/AiFillField.tsx`) : on choisit un modèle et on décrit la valeur attendue (le prompt peut référencer `{{variables}}` et sorties d'étapes). Au run, l'orchestrateur génère la valeur via le modèle (`aiFills` sur l'étape action, `lib/agent/schema.ts` / `lib/agent/orchestrator.ts`). Ces paramètres ne sont **pas** demandés à l'abonné (`lib/agent/contract.ts`).

---

## Structure du repo

```
app/
  (marketing)/          # Landing agent-centric
  dashboard/            # Espace agent : agents, runs & logs, connexions, validations, facturation
  admin/                # KPI + modération + agents ops internes
  api/                  # Routes API (run, connectors, stripe, cron…)
components/
  builder/              # Éditeur d'agent (canvas, wizard, inspector)
  run/                  # Masque de run, console, champs ressources
  connectors/           # ResourceSelect (picker auto-liste)
lib/
  agent/                # Manifeste, contrat, résolveur, orchestrateur, error-map, step-key
  connectors/           # Exécution & listing (Composio + natif), conformance
  composio/             # Backend Composio
  billing/              # Crédits, quota gratuit, plafonds
  llm/                  # Passerelle multi-modèles
worker/                 # run-worker.ts (npm run worker)
supabase/migrations/    # Migrations SQL
docs/                   # Guides (ADD-CONNECTOR, Render, Composio…)
tests/unit/             # Tests (contrat, résolveur, runtime, conformance…)
```

---

## Routes admin

| URL | Description |
|-----|-------------|
| `/admin` | Dashboard KPI |
| `/admin/agents` | Centre de contrôle agents ops (sandbox, budget, validation) |
| `/admin/moderation` | Modération |

Accessible uniquement si `profiles.is_admin = true`.

---

## Licence

Propriétaire — Prompta © 2026
