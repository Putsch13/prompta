# Test de parcours bout-en-bout

Ce document décrit les étapes pour vérifier que le parcours complet fonctionne
sur l'application déployée.

## Prérequis

1. **Migrations appliquées** : 
   - `0019_protect_is_admin.sql`
   - `0020_listing_tech_metadata.sql`
   
2. **Worker Render** : Service Background Worker configuré avec `npm run worker`
   et les variables d'environnement requises.

3. **Un seul admin** : Vérifier en base qu'il n'y a qu'un seul `is_admin = true`
   dans la table `profiles`.

4. **Migration modèles (v5)** : Exécuter `npx tsx scripts/migrate-model-ids.ts`
   pour migrer les anciens IDs de modèles.

## Modèles supportés (Mai 2026)

| Provider | Modèles |
|----------|---------|
| OpenAI | GPT-5.5, GPT-5.4, GPT-5.4 mini, GPT-5 mini, GPT-5 nano, o3, o3-mini |
| Anthropic | Claude Opus 4.7, Claude Opus 4.6, Claude Sonnet 4.6, Claude Haiku 4.5 |
| Google | Gemini 3.1 Pro, Gemini 3 Flash |
| Mistral | Mistral Large, Mistral Medium, Mistral Small |

> **Note** : Les anciens modèles (gpt-4o, claude-3-x, gemini-2.x) sont retirés.
> La couche `resolveModel` gère la rétrocompatibilité avec le mapping legacy.

## Parcours 1 : Prompt simple

1. Se connecter avec un compte utilisateur
2. Aller dans **Connexions** → Ajouter une clé OpenAI valide
3. Aller sur `/explore` → Choisir un prompt gratuit
4. Cliquer **Lancer** avec des variables → La sortie s'affiche

**Vérification** : La réponse s'affiche, le run est enregistré dans `/dashboard/runs`

## Parcours 2 : Agent multi-étapes

1. Se connecter en tant que builder
2. **Dashboard** → **Ajouter** → Choisir **Agent**
3. Étape **Bases** : titre, catégorie, description, sélectionner des modèles
   depuis le catalogue (GPT-5.4, Claude Sonnet 4.6…)
4. Étape **Contenu** : ajouter 2+ étapes LLM dans le StepEditor
   - Étape 1 : LLM → prompt avec `{{topic}}`
   - Étape 2 : LLM → prompt référençant `{{step_0_output}}`
5. Étape **Environnement** : ajouter la variable `topic`, sélectionner runtime
   (ex : Node.js 20+), sélectionner intégrations si besoin
6. Étape **Tarification** : Gratuit (ou payant si KYC Stripe complété)
7. Étape **Test** : remplir `topic` → Lancer → Vérifier que les 2 étapes passent
8. Étape **Publication** : Publier (passe en `under_review` si flags, sinon
   `published`)
9. Aller sur la fiche listing → Section **Compatibilité & prérequis** affiche
   les badges modèles/runtime/intégrations
10. Lancer l'agent depuis la fiche → Statut passe à `running` puis `completed`

**Vérifications** :
- Le playground builder affiche chaque étape et la sortie
- Le résultat final s'affiche sur la fiche
- Le run est visible dans `/dashboard/runs`

## Parcours 3 : Runs async (agents longs)

1. Créer un agent avec 4+ étapes ou une étape `tool` (http_fetch)
2. Le run est mis en file d'attente (`queued`)
3. Vérifier que le worker traite le run (statut passe à `running` puis
   `completed` ou `failed`)
4. Côté client, le polling affiche la progression

## Points de vérification admin

1. **/admin** : Section "Santé runtime agents marketplace" affiche :
   - Nombre de runs pending
   - Âge du run pending le plus ancien
   - Taux d'échec 24h
   - Top agents en erreur

2. **Cron `/api/cron/tick`** : Traite les runs `pending` en fallback si le
   worker est KO

## Worker & Cron (filet de sécurité)

### Background Worker (Render)
```bash
npm run worker
```
Le worker poll en continu la table `listing_agent_runs` et traite les runs
`pending`. Il utilise `processPendingAgentRuns(3)` pour traiter 3 runs à la fois.

### Cron Job (fallback)
Le cron `/api/cron/tick` traite également les runs `pending` en fallback si le
worker est KO. Configurer le cron Render pour appeler toutes les minutes :

```
GET https://xxx.onrender.com/api/cron/tick
Authorization: Bearer $CRON_SECRET
```

### Plafonds appliqués par l'orchestrateur
- `max_steps` : nombre d'étapes maximum par agent
- `max_tokens` : limite de tokens (estimée via longueur/4)
- `timeout_ms` : timeout global par run (défaut: 60s)

## Résumé des variables d'environnement Render

```env
# Web Service
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ENCRYPTION_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_CONNECT_CLIENT_ID=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
RESEND_API_KEY=
CRON_SECRET=

# Background Worker (service séparé)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ENCRYPTION_KEY=
# optionnel : PLATFORM_OPENAI_KEY, PLATFORM_ANTHROPIC_KEY...
```
