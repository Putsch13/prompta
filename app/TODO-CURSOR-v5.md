# TODO Cursor v5 — Prompta (réparer le moteur + seed marketplace + QA/UX)

> **Mode d'emploi.** Place ce fichier à la racine du repo. Traite les blocs **dans
> l'ordre**. Pour chaque bloc : *« Lis TODO-CURSOR-v5.md, implémente le Bloc N, coche les
> tâches faites, ne touche pas aux autres blocs. »*
> Après chaque bloc : `npx tsc --noEmit` et `npm run lint` doivent passer.
> Constats : `AUDIT-QA-v4.md`. Migrations SQL à continuer à partir de `0021`.

---

## 🔴 BLOC 1 — Réparer le moteur de modèles (BLOQUANT, à faire en premier)

> Cause racine du non-fonctionnement des agents : les identifiants de modèles du
> catalogue ne sont pas des identifiants d'API valides, et la passerelle utilise des
> modèles retirés.

### 1.1 Mettre le catalogue à jour — `lib/catalogs.ts`
- [x] Remplacer `AI_MODELS` par les modèles **actuels (mai 2026)**, chaque entrée portant
  l'**identifiant d'API réel** :
  - **OpenAI** : famille GPT-5.x (GPT-5.5, GPT-5.4, GPT-5.4 mini, GPT-5 mini, GPT-5 nano).
    `gpt-4o`/`gpt-4o-mini` sont retirés → les supprimer.
  - **Anthropic** : `claude-opus-4-7`, `claude-opus-4-6`, `claude-sonnet-4-6`,
    `claude-haiku-4-5`. Supprimer toute la génération Claude 3 (retirée).
  - **Google** : génération Gemini 3.x (Gemini 3.1 Pro, Gemini 3 Flash).
  - **Mistral / Meta / DeepSeek / xAI** : versions courantes.
- [x] ⚠️ **Vérifier chaque identifiant exact** sur les docs officielles (ils changent
  souvent) : `platform.openai.com/docs/models`, `docs.claude.com` (models overview),
  `ai.google.dev`. Ne pas deviner les snapshots.
- [x] Structure recommandée par entrée :
  `{ id, label, provider, apiModel, tokenParam: "max_tokens" | "max_completion_tokens", popular }`.

### 1.2 Couche de résolution — `lib/llm/resolve-model.ts`
- [x] Fonction `resolveModel(catalogId): { provider, apiModel, tokenParam }`.
- [x] L'orchestrateur (`lib/agent/orchestrator.ts`) et la route `/api/run/prompt`
  utilisent **`resolveModel`** avant d'appeler la passerelle — jamais l'id brut.

### 1.3 Corriger la passerelle — `lib/llm/gateway.ts`
- [x] Mettre à jour les modèles par défaut (`DEFAULT_MODELS`) avec des identifiants
  valides actuels.
- [x] Utiliser `tokenParam` : envoyer `max_completion_tokens` pour les modèles de
  raisonnement, `max_tokens` sinon.
- [x] En cas d'erreur fournisseur (404 modèle, 401 clé), remonter un message **clair et
  exploitable** (pas un dump brut).

### 1.4 Migration de l'existant
- [x] Script `scripts/migrate-model-ids.ts` : parcourir les `listing_versions`, remapper
  les anciens `model` des manifestes vers les nouveaux identifiants.
- **DoD :** un appel à chaque fournisseur (OpenAI, Anthropic, Google) aboutit avec une
  clé valide ; aucun identifiant de modèle retiré ne subsiste.

---

## 🔴 BLOC 2 — Faire fonctionner les agents de bout en bout

### 2.1 Vérifier la chaîne complète
- [x] Tester : créer un agent à 2 étapes (`llm` → `llm`) → le lancer depuis la fiche →
  obtenir une sortie réelle. Documenter le test dans `docs/`.
- [x] Confirmer que `runAgent` reçoit bien le manifeste (`parseListingEnv`) et que les
  `apiKeys` BYOK sont transmis.

### 2.2 États d'exécution clairs (UX)
- [x] `RunPanel` : afficher la **progression étape par étape** d'un agent (étape 1/3…).
- [x] Sur un run `failed`/`suspended` : message clair + action contextuelle
  (reconnecter une clé, réessayer, signaler).
- [x] Sur un run async : « En file d'attente » + polling de `/api/run/agent/[runId]`.

### 2.3 Worker garanti
- [x] Documenter `npm run worker` ; déclarer un **Render Background Worker** dédié.
- [x] Filet : le cron `app/api/cron/tick` traite aussi les runs `pending` orphelins.
- [x] Plafonds (`max_steps`, `max_tokens`, `timeout_ms`) réellement appliqués dans
  l'orchestrateur.
- **DoD :** un utilisateur avec une clé valide lance un prompt **et** un agent, voit la
  progression, et obtient un résultat ou une erreur claire.

---

## 🟣 BLOC 3 — Seed du marketplace : faux utilisateurs + avis intelligents

> ⚠️ **Avertissement important.** Afficher de **faux avis** rédigés par de faux comptes
> à de vrais clients est **interdit dans l'UE** (directive Omnibus, contrôle DGCCRF) et
> trompeur. Ce seed est **légitime uniquement pour un environnement de démo / staging /
> pré-lancement non public**. Pour la production, il faut soit (a) ne pas l'utiliser,
> soit (b) marquer clairement le contenu comme « démo », soit (c) collecter de vrais
> avis de bêta-testeurs. Implémente l'outil, mais cantonne-le au staging.

### 3.1 Générateur de comptes — `scripts/seed-users.ts`
- [x] Générer **1000 à 1500** comptes : utilisateur Supabase Auth (le trigger crée le
  profil) + `is_persona = true` (réutiliser/étendre la logique de `seed-personas.ts`).
- [x] Données réalistes : prénoms/noms variés (FR + EN), `username` unique, avatar par
  initiales, `headline` selon une spécialité, dates de création étalées sur ~12 mois.
- [x] Idempotent : relançable sans doublons (upsert par email).

### 3.2 Générateur d'avis intelligents — `scripts/seed-reviews.ts`
- [x] S'applique sur les **100 à 200 prompts** que tu auras publiés.
- [x] **Distribution en loi de puissance (Pareto)** sur les prompts :
  - ~10 % des prompts = « hits » → 60 à 200 avis chacun ;
  - ~30 % = engagement moyen → 12 à 40 avis ;
  - ~40 % = longue traîne → 1 à 9 avis ;
  - ~20 % = **aucun avis** (réaliste — tous les prompts ne décollent pas).
- [x] **Notes** : distribution réaliste, biais positif — ~55 % de 5★, ~28 % de 4★,
  ~12 % de 3★, ~5 % de 1-2★. Les « hits » ont une moyenne légèrement supérieure.
- [x] **Textes d'avis** : banque de phrases variées en français par catégorie (utile,
  mitigé, négatif), avec parfois un avis **sans texte** (juste une note — réaliste).
- [x] **Comportement des comptes** : la plupart laissent 1-3 avis ; une minorité en
  laisse 10-30 ; beaucoup de comptes n'en laissent **aucun** (ils existent juste).
- [x] **Horodatage** étalé : les avis d'un prompt s'accumulent progressivement après sa
  date de publication, pas tous le même jour.
- [x] Mettre à jour les agrégats (`listing_stats` : note moyenne, nb d'avis) en
  conséquence.
- [x] Paramètres en tête de script : `USER_COUNT`, `MIN/MAX` par palier, ratios — faciles
  à régler.

### 3.3 Garde-fous
- [x] Migration `0021_seed_flag.sql` : champ `is_seed boolean default false` sur
  `reviews` et `profiles` → permet de **tout retirer d'un coup** et de distinguer le
  contenu de démo.
- [x] Le script refuse de tourner si `NODE_ENV === "production"` sans variable
  `ALLOW_SEED=true` explicite.
- **DoD :** sur un environnement de démo, le marketplace paraît vivant — quelques prompts
  très commentés, une longue traîne, certains sans avis — et tout le seed est
  identifiable et réversible.

---

## 🟠 BLOC 4 — QA / UX

### 4.1 Parcours d'exécution lisible
- [x] `RunPanel` : **un seul chemin par état** —
  gratuit → « Lancer » ; payant non possédé → « Acheter / S'abonner » ; possédé/abonné →
  « Lancer » (BYOK). Ne plus mélanger les quatre modèles de paiement à l'écran.
- [x] Hiérarchiser : abonnement = action primaire pour les agents ; crédits = option
  discrète ; achat unique = pour les prompts.

### 4.2 Onboarding directif
- [x] Forcer le point de bascule : 1er run sans clé → wizard de clés ; 1er prix fixé sans
  Stripe → onboarding Connect. Messages clairs, jamais d'erreur brute.
- [x] Checklists d'onboarding (utilisateur et builder) visibles tant qu'incomplètes.

### 4.3 Playground builder réel
- [x] Étape « Test » du `CreateWizard` : exécuter le manifeste réel via `/api/run/agent`
  en mode preview, afficher chaque étape, la sortie, le coût estimé.

### 4.4 Cohérence tarifaire
- [x] Soit calculer le coût d'un run (tokens × tarif via le catalogue), soit assumer et
  **documenter** le forfait `RUN_CREDIT_COST_CENTS`.
- [x] Vérifier l'absence de **double facturation** (abonné → BYOK, pas de crédit débité).
- **DoD :** un nouvel utilisateur comprend en 5 s comment lancer et comment il paie ; un
  builder teste son agent avant publication.

---

## 🟢 BLOC 5 — Durcissement & ce qui manque (avant prod)

- [ ] **Tests e2e** du parcours critique : achat, run prompt, run agent (Playwright).
- [x] **Dashboard santé runtime** dans `/admin` : runs en file, taux d'échec 24 h,
  latence, agents en erreur.
- [x] **Estimation de coût** affichée avant chaque run.
- [x] **Modération du runtime** : scan des sorties d'agents, suspension automatique des
  agents abusifs. (via `scanOutput` dans l'orchestrateur)
- [ ] **Emails transactionnels** vérifiés (reçu d'achat, confirmation d'abonnement).
- [ ] **Rate limiting** confirmé sur checkout, download, webhooks, run.
- [ ] **Prod** : Render (web + worker + cron), Stripe live + webhooks, sauvegardes
  Supabase (PITR), variables d'env complètes.
- [ ] **Vrai streaming** SSE en remplacement du streaming simulé.
- **DoD :** le parcours achat → exécution est couvert par des tests et observable ;
  l'app est déployable en prod.

---

## Ordre & priorités

| Priorité | Bloc | Pourquoi |
|---|---|---|
| 🔴 Immédiat | 1, 2 | Sans moteur de modèles correct, les agents resteront cassés. |
| 🟣 Important | 3 | Donner vie au marketplace (démo/staging — lire l'avertissement). |
| 🟠 Haute | 4 | Rendre les parcours compréhensibles. |
| 🟢 Avant prod | 5 | Tests, observabilité, industrialisation. |

*Avance bloc par bloc, coche au fur et à mesure, garde `tsc` et `lint` au vert. Ne
commence rien d'autre tant que les Blocs 1 et 2 ne sont pas terminés et testés.*
