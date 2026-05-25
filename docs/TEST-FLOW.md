# Test de parcours bout-en-bout

Ce document décrit les étapes pour vérifier que le parcours complet fonctionne
sur l'application déployée.

## Prérequis

1. **Migration appliquée** : `supabase/migrations/0019_protect_is_admin.sql` et
   `supabase/migrations/0020_listing_tech_metadata.sql` doivent être appliquées
   dans Supabase SQL Editor.

2. **Worker Render** : Service Background Worker configuré avec `npm run worker`
   et les variables d'environnement requises (SUPABASE, ENCRYPTION_KEY, clés
   plateforme optionnelles).

3. **Un seul admin** : Vérifier en base qu'il n'y a qu'un seul `is_admin = true`
   dans la table `profiles`.

## Parcours 1 : Prompt simple

1. Se connecter avec un compte utilisateur
2. Aller dans **Connexions** → Ajouter une clé OpenAI valide
3. Aller sur `/explore` → Choisir un prompt gratuit
4. Cliquer **Lancer** avec des variables → La sortie s'affiche

## Parcours 2 : Agent multi-étapes

1. Se connecter en tant que builder
2. **Dashboard** → **Ajouter** → Choisir **Agent**
3. Étape **Bases** : titre, catégorie, description, sélectionner des modèles
   depuis le catalogue (GPT-4o, Claude Sonnet…)
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
