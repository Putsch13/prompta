# TODO Cursor v6 — Rentabilité, configuration & finition

> Complément final aux TODO précédentes (v5, builder-flow, connecteurs).
> Couvre : le moteur économique (crédits), ce que **toi** tu configures à la main, et la
> transformation UX/UI/QA. Objectif : un Prompta « wallet à agents IA » qui ne perd
> jamais d'argent.
> Après chaque bloc : `npx tsc --noEmit` et `npm run lint` doivent passer.
> Migrations SQL à continuer à partir de `0023`.

---

# SECTION A — Moteur de rentabilité (mode crédits)

> Principe : **les crédits sont prépayés**. Tu encaisses avant de dépenser. Tant que
> `1 crédit consommé < 1 crédit vendu`, tu ne peux pas perdre sur le coût variable.
> Tout ce qui suit sert à garantir cette inégalité.

## Bloc A1 — Table de tarifs des modèles
- [x] `lib/llm/pricing.ts` : table `MODEL_PRICING` — par modèle, le prix réel fournisseur
  `{ inputPer1M, outputPer1M }` en cents. Inclure tous les modèles du catalogue (A jour :
  GPT-5.x, Claude Opus 4.7 / Sonnet 4.6 / Haiku 4.5, Gemini 3.x…).
- [x] Coût des outils : `TOOL_PRICING` — `web_search` (Serper), connecteurs, etc.
- [x] Commentaire en tête : « valeurs à mettre à jour quand un fournisseur change ses
  prix » (cf. Section B).
- **DoD :** une source unique de vérité pour le coût réel de chaque modèle/outil.

## Bloc A2 — Calcul du coût réel d'un run
- [x] `lib/billing/run-cost.ts` — fonction `computeRunCost(usage)` :
  ```
  coût_réel_cents =
      Σ (tokens_in × prix_in + tokens_out × prix_out)   [par étape LLM]
    + Σ (appels d'outils × prix outil)
    + coût connecteur éventuel
    + COMPUTE_FLAT_CENTS  (forfait compute faible, ex. 0,5 c/run)
  ```
- [x] L'orchestrateur **collecte les tokens réellement consommés** à chaque étape (la
  passerelle doit remonter `usage` de chaque appel).
- **DoD :** chaque run produit un coût réel précis, jamais une estimation au doigt.

## Bloc A3 — Conversion en crédits + marge
- [x] `lib/billing/credits.ts` — constantes (décisions business, faciles à régler) :
  - `CREDIT_VALUE_CENTS` — valeur d'un crédit (ex. 2 c).
  - `MARKUP` — multiplicateur de marge (ex. 1,6 → conseillé entre 1,5 et 2).
  - `FREE_RUNS_PER_DAY` (ex. 15), `FREE_TIER_MODEL` (le modèle le moins cher),
    `FREE_RUN_MAX_TOKENS` (ex. 2000).
- [x] `costToCredits(costCents) = ceil(costCents × MARKUP / CREDIT_VALUE_CENTS)`.
- [x] **Supprimer** `RUN_CREDIT_COST_CENTS` (le forfait fixe) partout.
- **DoD :** le coût en crédits d'un run dépend du coût réel et embarque toujours la marge.

## Bloc A4 — Plafonds durs par run (bornes anti-fuite)
- [x] L'orchestrateur applique **réellement** : `max_steps`, `max_tokens` (par appel et
  cumulé), `timeout_ms` (via `Promise.race`), `max_tool_calls` (ex. 5),
  `max_output_bytes` (ex. 50 Ko). Dépassement → arrêt immédiat du run.
- [x] Détection de boucle (mêmes étapes répétées) → arrêt.
- [x] `estimateMaxCost(manifest)` : coût maximal théorique d'un run (worst case) à partir
  des plafonds — sert à la pré-autorisation (A5).
- **DoD :** le coût maximal d'un run est borné et connu à l'avance ; aucune boucle ne
  peut brûler indéfiniment.

## Bloc A5 — Pré-autorisation & solde
- [x] Migration `0023_credit_ledger.sql` : `credit_balance` sur `profiles`/`org`, et un
  **grand livre** `credit_transactions` (achat, hold, débit, remboursement) — traçable.
- [x] Avant un run en mode crédits :
  1. `estimateMaxCost` → convertir en crédits ;
  2. si `solde < estimation` → refuser proprement (« crédits insuffisants », CTA recharge) ;
  3. **bloquer (hold)** ce montant ;
  4. exécuter ;
  5. **régulariser** au coût réel, libérer la différence.
- [x] **Solde à zéro = stop** : plus aucun run en mode crédits. Frein ultime, automatique.
- **DoD :** un utilisateur ne peut jamais lancer un run qu'il ne peut pas payer ; tout
  mouvement de crédits est tracé.

## Bloc A6 — Routage BYOK vs crédits (le frein de design)
- [x] Règle unique appliquée par `/api/run/prompt`, `/api/run/agent` et le worker :
  - utilisateur **abonné / acheteur / Pro** **avec une clé valide** → **BYOK**, aucun
    crédit débité, coût plateforme ≈ 0 ;
  - sinon, s'il a des crédits → **mode crédits** (clés plateforme, A1-A5) ;
  - sinon → quota gratuit (A7) ou blocage avec CTA.
- [x] Jamais de double facturation : abonnement = accès ; clé/crédits = carburant.
- **DoD :** BYOK est le défaut (exposition plateforme minime) ; les crédits sont
  l'exception facturée avec marge.

## Bloc A7 — Quota gratuit borné
- [x] Les runs gratuits (essai d'un agent, prompt sans clé) tournent **uniquement** sur
  `FREE_TIER_MODEL`, plafonnés à `FREE_RUN_MAX_TOKENS` et `FREE_RUNS_PER_DAY` par
  utilisateur. Table `free_run_quota`.
- [x] Au-delà → bascule explicite vers BYOK ou crédits.
- **DoD :** le coût du gratuit par utilisateur/jour est borné à quelques centimes.

## Bloc A8 — Cache, rate limiting, coupe-circuit
- [ ] **Cache** : clé = (version du manifeste + inputs normalisés) → sortie. Un hit ne
  consomme aucun coût fournisseur (créditer 0 ou un mini-forfait).
- [ ] **Rate limiting** par utilisateur sur les runs (anti-abus / anti-drainage).
- [x] **Suivi marge** : enregistrer `coût_réel` vs `crédits_facturés × valeur` par run ;
  dashboard admin de la marge agrégée.
- [x] **Coupe-circuit** : si la marge d'un modèle passe négative (hausse de prix
  fournisseur non répercutée) → alerte + désactivation du mode crédits pour ce modèle.
- **DoD :** tu détectes une marge négative avant qu'elle te coûte cher ; le cache et le
  rate limiting réduisent les coûts et les abus.

---

# SECTION B — Ce que TU configures à la main (checklist fondateur)

> Ces éléments ne sont pas du code : ce sont des comptes, des clés et des décisions que
> **toi** tu dois mettre en place. À cocher avant la mise en production.

## B1 — Stripe
- [ ] Compte Stripe plateforme créé ; **Stripe Connect** activé (pour payer les builders).
- [ ] Récupérer `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_CONNECT_CLIENT_ID`.
- [ ] Créer les **produits/prix des packs de crédits** dans Stripe (ex. 5 € / 20 € / 50 €).
- [ ] Configurer les **webhooks** (un endpoint test, un endpoint live) → récupérer
  `STRIPE_WEBHOOK_SECRET` pour chaque.
- [ ] Activer **Stripe Tax** (TVA) et le **Customer Portal** (gestion des abonnements).
- [ ] Décider la **commission plateforme** (ex. 20 %) — la renseigner dans le code
  (`PLATFORM_COMMISSION_PERCENT`).
- [ ] Passage en **live** : refaire la config en mode live le moment venu.

## B2 — Clés API plateforme (pour le mode crédits)
- [ ] Créer un compte et une clé API chez **chaque fournisseur LLM** que tu veux proposer
  en mode crédits (OpenAI, Anthropic, Google, Mistral) → ce sont **tes** clés, qui
  paieront les runs des utilisateurs sans clé.
- [ ] Mettre une **limite de dépense** sur chacune côté fournisseur (filet de sécurité).
- [ ] Clé **Serper** (ou autre) pour l'outil de recherche web.

## B3 — Plateforme de connecteurs
- [ ] Créer le compte sur la plateforme choisie (Composio recommandé) → clé API.
- [ ] Enregistrer les **apps OAuth** nécessaires (Google, Canva, etc.) — souvent géré par
  la plateforme de connecteurs ; sinon, les créer toi-même chez chaque fournisseur.

## B4 — Économie des crédits (décisions business à fixer)
- [ ] Fixer `CREDIT_VALUE_CENTS`, `MARKUP`, le contenu des packs de crédits et les bonus.
- [ ] Fixer `FREE_RUNS_PER_DAY`, `FREE_TIER_MODEL`, `FREE_RUN_MAX_TOKENS`.
- [ ] Fixer les plafonds par run (`max_steps`, `max_tokens`, `timeout`, `max_tool_calls`).
- [ ] Renseigner la table `MODEL_PRICING` avec les vrais tarifs fournisseurs du jour.

## B5 — Infrastructure (Render)
- [ ] Service **web** (Next.js) + service **worker** (exécution des runs async) + **Cron
  Jobs** (traitement des `pending`, badges, runs planifiés).
- [ ] Renseigner **toutes** les variables d'environnement (voir B7).
- [ ] Domaine custom + HTTPS.

## B6 — Supabase & admin
- [ ] Appliquer toutes les migrations.
- [ ] Activer les **sauvegardes** (Point-in-Time Recovery).
- [ ] Créer **ton** compte admin (`is_admin = true` via `service_role`) — vérifier
  qu'aucun autre compte ne l'a.

## B7 — Variables d'environnement (liste à compléter)
- [ ] Supabase : `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, anon key.
- [ ] Stripe : secret, publishable, webhook secret(s), connect client id.
- [ ] Clés LLM plateforme : OpenAI / Anthropic / Google / Mistral / Serper.
- [ ] Connecteurs : clé de la plateforme (Composio…).
- [ ] `ENCRYPTION_KEY` (chiffrement des clés/connexions — **ne pas réutiliser** une autre
  clé).
- [ ] `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_B2B_LANDING_MODE` (= `hidden` pour l'instant).

## B8 — Légal
- [ ] Faire **valider par un juriste** les CGU / CGV / confidentialité, la commission, la
  procédure de takedown, et le DPA (données qui transitent par les agents).

---

# SECTION C — UX / UI : le « wallet à agents IA »

## Bloc C1 — Le hub « Mon wallet »
- [x] `app/wallet/page.tsx` (ou `/dashboard`) : le foyer de l'utilisateur final —
  - ses **agents abonnés** (lancer / gérer / résilier) ;
  - son **solde de crédits** + bouton « Recharger » ;
  - ses **connexions** (clés API + comptes OAuth, états) ;
  - son **historique de runs** (statut, coût en crédits).
- **DoD :** l'utilisateur gère toute sa vie d'agents IA depuis un seul écran.

## Bloc C2 — Transparence du coût avant chaque run
- [x] `RunPanel` : avant « Lancer », afficher selon le mode —
  BYOK : « tournera sur votre clé OpenAI » ; crédits : « ≈ 7 crédits (~0,14 €) » ;
  gratuit : « run gratuit (3/15 aujourd'hui) ».
- [x] Confirmation si le run dépasse un seuil de crédits.
- **DoD :** l'utilisateur sait toujours ce qu'un run va lui coûter, avant de le lancer.

## Bloc C3 — Recharge de crédits
- [ ] `components/wallet/TopUp.tsx` : packs de crédits, paiement Stripe, mise à jour du
  solde via webhook. Solde visible en permanence dans le header.
- **DoD :** recharger des crédits prend 20 secondes.

## Bloc C4 — Suppression du téléchargement d'agents
- [ ] Retirer toute UI de téléchargement pour les **agents/workflows** : un seul chemin =
  abonnement + exécution sur Prompta. Garder copie/téléchargement pour les **prompts**.
- [ ] Adapter les routes : pas de génération de bundle téléchargeable pour un agent.
- **DoD :** un agent ne se possède pas en fichier — il se fait tourner sur Prompta.

## Bloc C5 — Côté builder : pédagogie tarifaire
- [x] Étape Tarification du `CreateWizard` : afficher le **calcul comparatif** —
  « Abonnement 12 €/mois = 144 €/an récurrent · Vente unique 49 € = une fois ».
- [x] Rappel de la commission (`CommissionNote`) à chaque endroit qui touche à l'argent.
- [x] Guide de prix intégré : abonnement mensuel ≈ valeur de l'agent ÷ 4 à 6.
- **DoD :** le builder comprend de lui-même que l'abonnement lui rapporte plus.

---

# SECTION D — QA

- [ ] **Tests crédits** : jamais de solde négatif ; impossible de lancer un run sans le
  solde ; régularisation hold → réel correcte ; remboursement de la différence.
- [ ] **Tests plafonds** : un agent en boucle est tué ; un run dépassant `timeout` est
  tué ; le coût d'un run est toujours ≤ `estimateMaxCost`.
- [ ] **Tests routage** : un abonné avec clé ne consomme aucun crédit ; un non-abonné sans
  clé consomme des crédits ; jamais de double facturation.
- [ ] **Tests e2e** : achat de crédits → run d'agent en mode crédits → débit correct ;
  abonnement → run en BYOK.
- [ ] **Marge** : sur un échantillon de runs, vérifier `crédits facturés × valeur >
  coût réel` à chaque fois.
- [ ] Reprendre les QA en attente : catalogue de modèles à jour, fausses variables
  builder, worker lancé.
- **DoD :** la rentabilité est prouvée par des tests, pas supposée.

---

## Ordre

| Priorité | Section | Pourquoi |
|---|---|---|
| 🔴 D'abord | A1-A8 | Le moteur économique — sans lui, le mode crédits peut te faire perdre de l'argent. |
| 🔵 En parallèle | B (toi) | La config manuelle — à faire pendant que Cursor code la section A. |
| 🟠 Ensuite | C1-C5 | Le wallet et les parcours. |
| 🟢 Avant prod | D | Prouver la rentabilité et clôturer la QA. |

*Rappel : prépayé + compté + marge + bornes + BYOK par défaut = tu ne peux pas saigner.*