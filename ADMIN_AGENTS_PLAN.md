# Prompta — PLAN Admin & Agents (TODO Cursor)

> **Comment utiliser ce fichier.** Place-le à la racine du repo à côté de `PLAN.md`.
> Travaille **sprint par sprint, de haut en bas**. Avant chaque sprint, demande à Cursor :
> *« Lis ADMIN_AGENTS_PLAN.md, implémente le Sprint N, coche les tâches faites, ne touche pas aux sprints suivants. »*
> Tous les fichiers de code sont fournis dans le dossier `delivery/` — il suffit de les copier aux bons emplacements.

---

## 0. Objectif

Ajouter à Prompta :
1. Un **espace admin privé** (`/admin`) accessible uniquement par toi.
2. Un **dashboard KPI** (utilisateurs, ventes, revenus, etc.).
3. Un **centre de contrôle d'agents** : activer, planifier, lancer, **valider** ce qu'ils produisent.
4. **7 agents IA** qui travaillent pour le développement du site.
5. Des **garde-fous de sécurité** : plafonds de budget, coupe-circuit, validation manuelle obligatoire.

**Principe directeur de sécurité :** aucun agent ne publie quoi que ce soit ni ne dépense d'argent sans contrôle. Tout passe par une file de validation et un budget plafonné.

---

## 1. Décisions figées

| # | Sujet | Choix |
|---|-------|-------|
| 1 | Accès admin | Colonne `profiles.is_admin` — toi seul à `true` |
| 2 | Exécution agents | Render Cron Job (horaire) + déclenchement manuel depuis l'admin |
| 3 | Sécurité financière | Table `agent_budget` : plafond quotidien (2$) + mensuel (30$), coupe-circuit |
| 4 | Validation | Tout output d'agent est `pending` → tu approuves/rejettes dans `/admin/agents` |
| 5 | Modèle IA | Claude Sonnet via API Anthropic, wrapper unique `lib/agents/anthropic.ts` |
| 6 | Personas | Jusqu'à 150 comptes générés, marqués `profiles.is_persona = true` |

---

## 2. Les 7 agents

| Slug | Nom | Rôle | Validation |
|------|-----|------|------------|
| `prompt_factory` | Prompt Factory | Génère prompts gratuits + payants sous pseudos | ✅ requise |
| `linkedin_publisher` | LinkedIn Publisher | Rédige des posts LinkedIn promo | ✅ requise |
| `seo_content` | SEO Content | Articles de blog optimisés SEO | ✅ requise |
| `moderation` | Modération | Signale les listings problématiques | ⚠️ signale seulement |
| `email_crm` | Email & CRM | Prépare les séquences email | ✅ requise |
| `analytics_pricing` | Analytics & Pricing | Suggère des ajustements de prix | ✅ requise |
| `affiliate` | Affiliate | Messages d'approche partenaires | ✅ requise |

**Aucun agent n'agit en autonomie complète.** Le seul qui « agit » est `moderation`, et uniquement pour *signaler* (jamais supprimer).

---

## SPRINT 1 — Base de données

**Objectif :** créer toutes les tables admin/agents.

### Tâches
- [x] Copier `delivery/supabase/migrations/0004_admin_agents.sql` → `supabase/migrations/0015_admin_agents.sql`.
- [x] Copier `delivery/supabase/migrations/0005_sandbox.sql` → `supabase/migrations/0016_admin_agents_sandbox.sql`.
- [x] Migration `0014_rename_listing_agent_runs.sql` (renommage conflit agent_runs).
- [ ] Exécuter les migrations **0014 → 0016** dans Supabase → SQL Editor.
- [ ] Te passer admin : `update profiles set is_admin = true where username = 'TON_USERNAME';`
- [ ] Vérifier les 8 tables + colonnes sandbox (`agent_budget.mode`, `agent_runs.is_sandbox`, `agent_outputs.is_sandbox`).
- [ ] Vérifier que `agent_budget.mode = 'sandbox'` (mode test par défaut).
- [ ] Vérifier que les 7 agents sont dans `agent_definitions` (tous `is_enabled = false`).

### Définition de terminé
Les migrations passent, tu es admin, le système démarre en mode sandbox.

---

## SPRINT 1bis — Comprendre le mode Sandbox

**Le mode sandbox est ta protection n°1 pour tester sans risque.**

- En **sandbox** : les agents tournent normalement MAIS le wrapper `anthropic.ts` renvoie des réponses **simulées**. Coût API = **0 $**. Les données produites sont marquées `is_sandbox = true`, affichées avec un badge 🧪, et **jamais publiées** dans les vraies tables `listings`.
- En **live** : appels API réels, budget débité, publication réelle après validation.
- Le bouton **🗑 Vider la sandbox** efface toutes les données de test d'un coup (fonction SQL `purge_sandbox`).
- La bascule sandbox ↔ live se fait depuis `/admin/agents`, bandeau du haut.

**Règle d'or :** reste en sandbox tant que tu n'as pas vu tourner toute la chaîne (lancer → produire → valider) au moins une fois pour chaque agent.

---

## SPRINT 2 — Variables d'environnement & dépendances

**Objectif :** préparer les secrets et le wrapper IA.

### Tâches
- [x] Ajouter dans `.env.local` ET dans Render → Environment :
  ```
  ANTHROPIC_API_KEY=sk-ant-...
  CRON_SECRET=<chaîne aléatoire longue, ex: openssl rand -hex 32>
  ```
- [x] Mettre à jour `lib/env.ts` : ajouter `ANTHROPIC_API_KEY` et `CRON_SECRET` au `envSchema` (server-side uniquement, PAS dans `clientSchema`).
- [x] Copier `delivery/lib/agents/` complet dans `lib/agents/` : `budget.ts`, `anthropic.ts`, `runner.ts`, `types.ts`.
- [x] Copier `delivery/lib/admin/guard.ts` dans `lib/admin/`.

### Définition de terminé
`npm run build` passe. Les imports `@/lib/agents/*` et `@/lib/admin/guard` résolvent.

### ⚠️ Sécurité
`ANTHROPIC_API_KEY` et `CRON_SECRET` ne doivent JAMAIS avoir le préfixe `NEXT_PUBLIC_`. Ils restent côté serveur.

---

## SPRINT 3 — Les 7 agents

**Objectif :** poser le code des agents.

### Tâches
- [x] Copier tout `delivery/agents/` dans `agents/` à la racine : `index.ts` + les 7 fichiers.
- [x] Vérifier le `tsconfig.json` : le path `@/*` doit couvrir la racine pour que `@/agents` résolve. Si besoin, ajouter `"@/agents": ["./agents/index.ts"]` ou garder `@/*` → `./*`.
- [x] Lire chaque agent et adapter les `CATEGORIES`, profils-cibles, etc. à ta réalité.

### Définition de terminé
`npm run build` passe. `AGENT_REGISTRY` exporte 7 fonctions.

---

## SPRINT 4 — Routes API

**Objectif :** exposer le déclenchement et la validation.

### Tâches
- [x] Copier `delivery/app/api/cron/tick/route.ts` → `app/api/cron/tick/route.ts`.
- [x] Copier `delivery/app/api/agents/run/route.ts` → `app/api/agents/run/route.ts`.
- [x] Copier `delivery/app/api/agents/approve/route.ts` → `app/api/agents/approve/route.ts`.
- [x] Copier `delivery/app/api/agents/sandbox/route.ts` → `app/api/agents/sandbox/route.ts`.
- [x] Vérifier que `lib/slug.ts` exporte `uniqueSlug` (utilisé par `approve`).
- [x] Mettre à jour `middleware.ts` : ajouter `/admin` à `PROTECTED_ROUTES`.

### Test manuel
- [ ] `curl -H "Authorization: Bearer MAUVAIS" .../api/cron/tick` → **401**.
- [ ] `curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/tick` → **200** avec `ran: []`.

### Définition de terminé
Les 3 routes répondent, le cron est protégé, `/admin` est dans le middleware.

---

## SPRINT 5 — Interface admin

**Objectif :** le dashboard et le centre de contrôle.

### Tâches
- [x] Copier `delivery/app/admin/layout.tsx` → `app/admin/layout.tsx`.
- [x] Copier `delivery/app/admin/page.tsx` → `app/admin/page.tsx` (dashboard KPI).
- [x] Copier `delivery/app/admin/agents/page.tsx` → `app/admin/agents/page.tsx`.
- [x] Copier `delivery/app/admin/agents/AgentsControlPanel.tsx` → `app/admin/agents/AgentsControlPanel.tsx`.
- [x] Vérifier que `createServerClient` est bien exporté par `lib/supabase/server.ts` (sinon adapter l'import dans `guard.ts`).
- [x] Ajouter un lien discret vers `/admin` dans `components/Header.tsx`, visible **uniquement si l'utilisateur est admin**.

### Test manuel
- [ ] Connecté en admin → `/admin` s'affiche avec les KPI.
- [ ] Connecté en non-admin → `/admin` redirige vers `/`.
- [ ] Non connecté → `/admin` redirige vers `/login`.

### Définition de terminé
Tu vois tes KPI et le centre de contrôle. Les non-admins n'y accèdent pas.

---

## SPRINT 6 — Personas

**Objectif :** créer les comptes utilisés par Prompt Factory.

### Tâches
- [x] Installer `tsx` en dev : `npm i -D tsx`.
- [x] Copier `delivery/scripts/seed-personas.ts` → `scripts/seed-personas.ts`.
- [ ] Lancer **une seule fois** : `npx tsx scripts/seed-personas.ts`.
- [ ] Vérifier dans Supabase : ~150 lignes dans `personas`, autant de `profiles` avec `is_persona = true`.

### Définition de terminé
Les personas existent et sont liés à des profils réels.

---

## SPRINT 7 — Test en sandbox puis activation

**Objectif :** valider toute la chaîne en sandbox AVANT de dépenser un centime.

### Phase A — Test en sandbox (coût zéro)
- [ ] Vérifier que le bandeau de `/admin/agents` affiche bien **🧪 MODE SANDBOX**.
- [ ] Passer `prompt_factory` à `is_enabled = true` dans `agent_definitions`.
- [ ] Cliquer **▶ Lancer** → des outputs simulés apparaissent dans l'onglet À valider, badgés 🧪.
- [ ] Tester Approuver / Rejeter : un output sandbox approuvé est marqué validé mais **n'est PAS** publié dans `listings` (c'est voulu).
- [ ] Tester chaque agent en sandbox de la même façon.
- [ ] Cliquer **🗑 Vider la sandbox** pour nettoyer les données de test.

### Phase B — Passage en live (progressif)
- [ ] Quand tu es à l'aise : bouton **→ Passer en LIVE** dans le bandeau.
- [ ] Lancer `prompt_factory` pour de vrai → cette fois les prompts approuvés deviennent de vrais `listings`.
- [ ] Surveiller le budget pendant quelques jours.
- [ ] Activer les autres agents un par un.
- [ ] Configurer les plannings dans `agent_schedules`. Pour les soirs : `hours = '{19,20,21}'`.

### Définition de terminé
Tu as testé toute la chaîne en sandbox sans coût, puis basculé en live en confiance.

---

## SPRINT 8 — Cron Render (automatisation 24/7)

**Objectif :** faire tourner les agents sans toi.

### Tâches
- [ ] Sur Render → ton service → **Cron Jobs** → New Cron Job.
- [ ] Schedule : `0 * * * *` (toutes les heures à la minute 0).
- [ ] Command :
  ```
  curl -sS -H "Authorization: Bearer $CRON_SECRET" https://TON-DOMAINE/api/cron/tick
  ```
- [ ] Vérifier que `CRON_SECRET` est bien dans les variables d'environnement du cron.
- [ ] Attendre le passage d'une heure planifiée → vérifier `agent_runs`.

### Définition de terminé
Le cron déclenche les agents selon `agent_schedules`, et tu retrouves leurs runs.

---

## 3. Sécurité — récapitulatif des garde-fous

| Risque | Garde-fou | Où |
|--------|-----------|-----|
| Tester sans rien dépenser ni casser | **Mode sandbox** : réponses simulées, coût 0$, données isolées et purgeables | `agent_budget.mode` + `lib/agents/anthropic.ts` |
| Facture API qui explose | Plafond quotidien 2$ + mensuel 30$, vérifiés AVANT chaque appel | `lib/agents/budget.ts` |
| Tout couper d'un coup | `agent_budget.is_paused = true` → plus aucun agent ne tourne | bouton coupe-circuit `/admin/agents` |
| Contenu publié sans contrôle | Tout output est `pending` → validation manuelle obligatoire | `agent_outputs` + `/admin/agents` |
| Données de test polluant la prod | Outputs sandbox jamais publiés dans `listings` ; purge en 1 clic | `app/api/agents/approve` + `purge_sandbox()` |
| Agent qui boucle | `max_runs_per_day` par agent | `agent_definitions` |
| Cron appelé par un tiers | Header `Authorization: Bearer CRON_SECRET` | `app/api/cron/tick` |
| Accès admin non autorisé | `requireAdmin()` + RLS `is_admin()` | `lib/admin/guard.ts` + migration |
| Clés exposées côté client | Pas de préfixe `NEXT_PUBLIC_` sur les secrets | `.env` + `lib/env.ts` |

### Régler les plafonds
Pour ajuster ton budget, dans Supabase :
```sql
update agent_budget
set daily_cap_usd = 1.00, monthly_cap_usd = 15.00
where id = 1;
```

### Estimation de coût
Un prompt généré ≈ 0,01-0,02 $. Avec un plafond mensuel de 30 $, tu es protégé : l'agent s'arrête tout seul avant de dépasser. Commence bas (15 $), tu augmenteras si le ROI est là.

---

## 4. Ordre de mise en route conseillé

1. Sprints 1→6 : tout installer, build OK.
2. Sprint 7 : activer **uniquement** `prompt_factory`, le lancer à la main, valider.
3. Observer le budget pendant quelques jours.
4. Activer `moderation` (peu coûteux, utile).
5. Activer les autres un par un selon ton temps de validation disponible.
6. Sprint 8 : brancher le cron quand tu fais confiance au système.

> Ne lance pas les 7 agents le premier jour. Tu veux d'abord valider que ce qu'ils produisent te convient.
