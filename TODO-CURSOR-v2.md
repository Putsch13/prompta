# TODO Cursor — Prompta v2 (exécutable, depuis la revue CTO)

> **Mode d'emploi.** Place ce fichier à la racine du repo. Travaille **phase par phase,
> bloc par bloc, de haut en bas**. Pour chaque bloc, demande à Cursor :
> *« Lis TODO-CURSOR-v2.md, implémente le Bloc X.Y, coche les tâches faites, ne touche
> pas aux autres blocs. »*
> Après chaque bloc : `npx tsc --noEmit` et `npm run lint` doivent passer.
> Ce fichier **remplace** `TODO-CURSOR.md` (v1).

**Conventions du projet (déjà en place) :**
- Tokens `tailwind.config.ts` : `bg / card / card2 / line / line-soft / ink / ink-soft /
  ink-faint / accent / accent-dim / star`, `max-w-page` (1180px).
- Polices : `font-display` (titres), `font-body` (texte), `font-mono` (code).
- Primitives : `components/ui.tsx` (`Kicker`, `Stars`, `TypeBadge`, `PriceTag`, `fmt`),
  `components/PromptCard.tsx`. **Toujours les réutiliser.**
- Migrations SQL versionnées dans `supabase/migrations/` — continuer la numérotation
  à partir de `0004`.
- Écritures sensibles → routes API serveur avec `service_role`, jamais le client.
- RLS active sur **toutes** les tables.

**Règle d'or CTO :** ne pas ouvrir la Phase 1 (runtime) tant que la Phase 0 (modération
+ sécurité) n'est pas terminée.

---

# PHASE 0 — Débloquer & sécuriser

## Bloc 0.1 — Rôle admin & back-office de modération
- [x] Migration `0004_admin_and_moderation.sql` : `is_admin boolean default false` sur
  `profiles` ; RLS : seuls les admins lisent/écrivent les tables de modération.
- [x] `lib/auth.ts` : `requireAdmin()` (vérifie session + `is_admin`, sinon `redirect`).
- [x] `app/admin/layout.tsx` : layout admin protégé par `requireAdmin()`.
- [x] `app/admin/moderation/page.tsx` : liste des `listings` en `under_review` (titre,
  créateur, type, date, résultat des scans, aperçu de la description).
- [x] `app/api/admin/moderate/route.ts` : route serveur (`service_role`) — actions
  `approve` (→ `published`) et `reject` (→ `rejected` + motif).
- [x] Onglet « Signalements » : liste des `moderation_flags` ouverts + action « Traiter ».
- [x] Table `moderation_actions` (audit) : qui, quoi, quand, motif.
- **DoD :** un admin approuve/refuse un listing ; un contenu refusé n'apparaît jamais
  dans `/explore` ; toute décision est tracée.

## Bloc 0.2 — Filtres de contenu & scan étendu
- [x] `lib/content-filter.ts` : `scanContent(text)` — détecte jailbreaks
  (« ignore previous instructions », « DAN »…), NSFW, incitation illégale,
  désinformation flagrante. Retourne `{ flagged, reasons[] }`.
- [x] Étendre `lib/secrets-scanner.ts` : détecter aussi code suspect et liens
  d'exfiltration dans les bundles.
- [x] Au dépôt (`app/dashboard/new` + `listing/[id]/edit`), appeler `scanContent` sur
  `description` + `prompt_body` ; tout hit → reste `under_review` avec motif enregistré.
- **DoD :** un dépôt suspect est bloqué en `under_review` avec un motif lisible par
  l'admin.

## Bloc 0.3 — Rate limiting
- [x] `lib/rate-limit.ts` : limiteur par IP/utilisateur (Upstash Redis si dispo, sinon
  LRU mémoire). Fonction `checkRateLimit(key, limit, windowMs)`.
- [x] Appliquer sur : `api/stripe/checkout`, `api/download/[versionId]`,
  `api/webhooks/stripe`, routes d'auth. Réponse `429` au dépassement.
- **DoD :** un flood sur ces routes renvoie `429` au-delà du seuil.

## Bloc 0.4 — Finir le reskin (parité visuelle avec le preview)
- [x] `app/u/[username]/page.tsx` : bannière dégradée, avatar 86px, grille de stats 4
  colonnes, badges en pilules, onglets Prompts/Avis/Activité (timeline), encart LinkedIn.
- [x] `app/dashboard/page.tsx` + `layout.tsx` : cartes `bg-card border-line rounded-xl`,
  chiffres en `font-display`, plus aucune classe `text-gray-*`/`bg-gray-*`.
- [x] `app/dashboard/{new,edit-profile,payouts,listing/[id]/edit}` : formulaires
  reskinnés (inputs `h-10 rounded-lg border-line`, boutons primaires `bg-accent`).
- [x] `app/(auth)/{login,signup,onboarding}` : carte centrée `max-w-[420px]`, logo
  « Prompta + point bleu », champs cohérents.
- **DoD :** toutes les pages partagent l'identité visuelle du preview.

## Bloc 0.5 — Pages légales
- [ ] Faire valider `/legal/terms` et `/legal/privacy` (gabarits déjà créés) par un
  juriste ; ajouter la procédure de **takedown** dans les CGU.
- **DoD :** CGU/CGV/confidentialité complètes et publiées.

**Définition de terminé Phase 0 :** rien n'est publié sans validation ; routes
sensibles protégées ; design unifié ; cadre légal en place.

---

# PHASE 1 — Runtime & double mode Copier / Lancer

## Bloc 1.1 — Passerelle modèles
- [x] `lib/llm/gateway.ts` : interface unique multi-fournisseurs (OpenAI, Anthropic,
  Google, Mistral). Démarrer avec LiteLLM ou OpenRouter. Fonction
  `callModel({ provider, model, messages, apiKey, stream })`.
- [x] Gérer le `fallback` (modèle de secours si le préféré échoue) et le comptage de
  tokens consommés.
- [x] `lib/llm/providers.ts` : catalogue des modèles disponibles par fournisseur.
- **DoD :** un même appel fonctionne sur ≥ 3 fournisseurs via une seule interface.

## Bloc 1.2 — Clés API : modèle de données & chiffrement
- [x] Migration `0005_api_keys.sql` : tables `user_api_keys` et `org_api_keys`
  (`owner_id`, `provider`, `encrypted_key`, `last4`, `is_valid`, `last_checked_at`,
  `created_at`) + `key_events` (audit : ajout/rotation/suppression, **sans la valeur**).
- [x] RLS stricte : un utilisateur ne lit que ses clés ; aucune colonne `encrypted_key`
  exposable côté client.
- [x] `lib/crypto.ts` : chiffrement/déchiffrement (libsodium *sealed box* ou KMS). Clé
  serveur via variable d'env, jamais dans le code.
- **DoD :** une clé stockée est chiffrée au repos et ne ressort jamais en clair vers le
  client.

## Bloc 1.3 — Écran « Mes connexions » & cycle de vie des clés
- [x] `app/dashboard/connexions/page.tsx` : liste des clés (provider, `last4`, état),
  ajout, test de validité en direct, **rotation**, **suppression**.
- [x] `app/api/keys/route.ts` : CRUD serveur. Le `GET` ne renvoie jamais `encrypted_key`.
- [x] **Suppression avec avertissement d'impact** : avant de supprimer, afficher les
  agents/prompts qui dépendent de cette clé ; confirmation explicite ; **hard-delete**.
- [x] Découpler clé et abonnement : supprimer une clé ne résilie aucun abonnement.
- [x] Détection d'expiration : un run échouant pour auth fournisseur bascule la clé en
  `is_valid = false` et invite à la re-saisir.
- [x] Variante org (B2B) : clés gérées par l'admin, avertissement renforcé à la
  suppression.
- **DoD :** cycle de vie complet (ajout, test, rotation, suppression sûre) opérationnel.

## Bloc 1.4 — Assistant de configuration de l'utilisateur final (UX onboarding)
> Objectif : un utilisateur non technique doit configurer ses clés **sans friction**.
- [x] `components/onboarding/UserSetupWizard.tsx` : assistant en 3 étapes :
  1. **Choisir ses fournisseurs** (OpenAI, Anthropic, Google…) — cartes cliquables.
  2. **Coller ses clés** — un champ par fournisseur choisi, avec un lien d'aide
     contextuel (« Où trouver ma clé OpenAI ? » → court guide illustré) et le test de
     validité en direct.
  3. **Confirmation** — « Vous êtes prêt à lancer des prompts et agents. »
- [x] Déclenchement : au premier clic sur « Lancer ici » sans clé, et accessible depuis
  un encart sur le dashboard.
- [x] **État vide intelligent** : tant qu'aucune clé n'est configurée, le masque
  « Lancer » affiche un appel à l'action doux vers l'assistant — jamais une erreur.
- [x] **Checklist d'onboarding** sur le dashboard utilisateur : « Configurez une clé »,
  « Lancez votre premier prompt », « Suivez un builder » — barre de progression.
- **DoD :** un nouvel utilisateur configure une clé et lance son premier prompt en
  moins de 2 minutes, guidé de bout en bout.

## Bloc 1.5 — Masque d'exécution double mode (Copier / Lancer)
- [x] `components/run/RunPanel.tsx` : bloc « Utiliser ce prompt » à **deux onglets**.
  - **Onglet Copier** : champs de variables (optionnels), choix « copier le modèle » /
    « copier rempli », bouton avec retour visuel (« Copié ✓ »). Disponible pour les
    prompts gratuits, et pour les payants **après achat**.
  - **Onglet Lancer ici** : mêmes champs + sélecteur de modèle (limité aux modèles
    compatibles déclarés) + bloc « Connexions requises » (état `✓`/`⚠` + ajout inline)
    + estimation de coût + bouton « Lancer ».
- [x] États du bouton « Lancer » : `prêt` / `à configurer` (ouvre le wizard 1.4) /
  `payant non acheté` (remplacé par « Acheter — X € »).
- [x] Intégrer `RunPanel` dans `app/listing/[slug]/page.tsx`.
- [x] Responsive : onglets → deux boutons empilés sur mobile.
- **DoD :** sur une fiche prompt, l'utilisateur peut copier le prompt **ou** le lancer ;
  la copie n'est jamais bridée par l'absence de clé.

## Bloc 1.6 — Run de prompt en un clic
- [x] `app/api/run/prompt/route.ts` : exécute un prompt simple via la passerelle (1.1)
  avec la clé de l'utilisateur (BYOK) ; **streaming** du résultat (SSE).
- [x] Quota gratuit plafonné (clés plateforme) pour les utilisateurs sans clé — table
  `free_run_quota`, ex. 20 runs/jour.
- [x] Table `runs` : `user_id`, `listing_id`, `version_id`, `status`, `tokens`, `cost`,
  `created_at`.
- [x] Historique des runs + bouton « relancer » (UI dashboard `/dashboard/runs`).
- **DoD :** un prompt gratuit se lance en un clic, résultat streamé, run historisé.

## Bloc 1.7 — Manifeste agent + orchestrateur + outils
- [x] `lib/agent/schema.ts` : schéma Zod du manifeste `agent.json` (`inputs`, `secrets`,
  `tools`, `steps` [`llm`/`tool`], `limits`, `outputs`).
- [x] `lib/agent/orchestrator.ts` : exécute le manifeste étape par étape (file
  `agent_runs`, retries, timeouts, plafonds `max_steps`/`max_tokens`).
- [x] `lib/agent/tools/` : outils en **liste blanche** — `web_search` (Serper),
  `http_fetch` (avec **filtrage d'egress** : IP privées interdites), `file_read`.
- [x] Service worker d'exécution séparé (déployable à part sur Render) — `npm run worker`.
- [x] Scan des sorties (réutilise `lib/content-filter.ts`) ; un agent abusif est suspendu.
- **DoD :** un agent déclaratif s'exécute de bout en bout, étapes streamées, dans les
  plafonds, sans accès réseau interne.

## Bloc 1.8 — Assistant de création pour le builder (wizard prompt / env / agent)
> Objectif : remplacer le gros formulaire `/dashboard/new` par un parcours guidé.
- [x] `components/builder/CreateWizard.tsx` : stepper avec barre de progression :
  1. **Type** — Prompt / Agent / Workflow (cartes explicatives + exemple de cas d'usage).
  2. **Bases** — titre, catégorie, description, modèles compatibles.
  3. **Contenu** —
     - Prompt : éditeur de texte avec détection automatique des `{{variables}}`.
     - Agent/Workflow : **éditeur visuel d'étapes** (ajouter étape `llm` ou `tool`,
       glisser-déposer, choisir le modèle et les outils en liste blanche).
  4. **Environnement** — assistant qui aide à déclarer : clés API requises, variables,
     dépendances, temps de setup estimé. Champs pré-remplis selon le type.
  5. **Tarification** — Gratuit / Achat unique / Abonnement (avec montant).
  6. **Test (Playground)** — le builder lance son contenu sur des entrées d'exemple,
     voit chaque étape, le coût estimé, les sorties ; jeux de test de référence.
  7. **Publication** — récap + envoi en `under_review`.
- [x] Chaque étape : aide contextuelle inline, validation Zod, exemples, possibilité de
  **partir d'un modèle** (templates pré-remplis par type).
- [x] Sauvegarde en brouillon à chaque étape (jamais de perte de saisie).
- [x] Brancher sur la création de `listing` + `listing_version` (semver, slug, statut).
- **DoD :** un builder crée et teste un agent complet, étape par étape, sans jamais être
  bloqué ni perdre sa saisie ; le contenu part en validation.

**Définition de terminé Phase 1 :** prompts et agents s'exécutent sur la plateforme ;
builders et utilisateurs sont guidés ; le double mode Copier/Lancer fonctionne.

---

# PHASE 2 — Monétisation récurrente

## Bloc 2.1 — Abonnements aux agents (Stripe)
- [x] Migration `0006_subscriptions.sql` : table `subscriptions` (`user_id`,
  `listing_id`, `stripe_subscription_id`, `status`, `current_period_end`).
- [x] `app/api/stripe/subscribe/route.ts` : crée une `Subscription` Stripe sur le compte
  plateforme avec `application_fee_percent` + `transfer_data.destination` = compte
  Connect du builder.
- [x] L'accès « Lancer » d'un agent payant est conditionné à un abonnement `active`.
- [x] Le builder fixe son prix d'abonnement dans le wizard (Bloc 1.8, étape 5).
- **DoD :** un utilisateur s'abonne à un agent, peut le lancer ; le builder touche du MRR,
  la plateforme sa commission.

## Bloc 2.2 — Customer Portal, dunning, TVA, reçus
- [x] Activer le **Stripe Customer Portal** : `app/dashboard/abonnements/page.tsx` avec
  lien vers le portail (gérer/annuler, mettre à jour la carte).
- [x] Webhooks : `invoice.paid`, `invoice.payment_failed`,
  `customer.subscription.updated/deleted` → mettre à jour `subscriptions`.
- [x] **Dunning** : à l'échec final de paiement, suspendre l'accès à l'agent après une
  courte période de grâce.
- [x] **Stripe Tax** : `automatic_tax` activé ; stocker `tax_cents` sur les transactions
  (migration `0007_tax.sql`).
- [x] `lib/email.ts` (Resend) : reçu d'achat / de facture par email.
- **DoD :** abonnements gérables en autonomie, TVA calculée, reçus envoyés, impayés gérés.

## Bloc 2.3 — KYC builder & revenus
- [x] Bloquer achat/abonnement si le créateur n'a pas `charges_enabled` **et**
  `payouts_enabled` (écouter `account.updated`).
- [x] `BuyButton`/`RunPanel` : message explicite si le créateur n'est pas KYC-complet.
- [x] `app/dashboard/payouts` : tableau des revenus — ventes, commissions, payouts.
- [x] Afficher le **MRR** (abonnements actifs) sur la page payouts.
- **DoD :** impossible de payer un créateur non vérifié ; le builder voit son MRR.

## Bloc 2.4 — Galop d'essai & mode crédits (option confort)
- [x] Essais gratuits : X runs d'agent gratuits avant abonnement (clés plateforme,
  plafonné) — réutilise `free_run_quota`.
- [x] Mode crédits plateforme (optionnel) : packs de crédits, débit par run sur les clés
  plateforme avec marge — positionné comme confort premium.
- **DoD :** un utilisateur peut essayer un agent avant de s'abonner.

**Définition de terminé Phase 2 :** revenus récurrents en place, conformes fiscalement,
avec essai avant achat.

---

# PHASE 3 — Croissance & B2B

## Bloc 3.1 — Promotion builder (OG dynamiques, fiche synthèse, LinkedIn)
- [x] `app/listing/[slug]/opengraph-image.tsx` & `app/u/[username]/opengraph-image.tsx` :
  images OG **générées dynamiquement** (`next/og` `ImageResponse`) — carte soignée
  (titre, note, téléchargements, créateur, badge) au design du preview.
- [x] `app/u/[username]/synthese/page.tsx` : **fiche synthèse** builder (stats, top
  prompts, badges), partageable et exportable en image.
- [x] Bouton **« Promouvoir »** sur chaque listing du dashboard → partage LinkedIn
  pré-rempli (`linkedin.com/sharing/share-offsite/?url=…`) + texte suggéré éditable.
- [x] Encart « Ajouter ma certification sur LinkedIn » sur `/u/[username]`.
- **DoD :** chaque partage de fiche/profil déplie une carte visuelle ; le builder
  promeut son dernier prompt en un clic.

## Bloc 3.2 — Badges automatiques & SEO
- [x] Migration `0008_seed_badges.sql` : badges de base (`verified`, paliers de
  téléchargements, `top_1pct_category`).
- [x] `app/api/cron/badges/route.ts` (protégée par secret) : recalcule `creator_badges` ;
  déclarer un Render Cron Job quotidien.
- [x] `app/c/[slug]/page.tsx` : pages catégories indexables (ISR), grille de
  `PromptCard` ; l'accueil/explore pointent vers `/c/[slug]`.
- [x] Fiches listing en **ISR** (`revalidate`) + `canonical` + JSON-LD `Product`/`Review`.
- [x] Compléter `app/sitemap.ts` avec les URLs catégories.
- **DoD :** badges vivants, chaque catégorie est une landing SEO, fiches en ISR.

## Bloc 3.3 — B2B : organisations, rôles, espaces
- [x] Migration `0009_organizations.sql` : `organizations`, `org_members` (rôles
  admin/éditeur/lecteur), RLS par org ; bibliothèque privée (listings internes).
- [x] `app/org/[slug]/` : espace organisation — bibliothèque privée, espaces par
  équipe/département, gestion des membres.
- [x] **Import marketplace → bibliothèque privée** : cloner un agent public dans l'org.
- [x] Workflow d'approbation interne + audit log org.
- [x] Clés API au **niveau organisation** (réutilise `org_api_keys` du Bloc 1.2).
- **DoD :** une entreprise gère une bibliothèque privée d'agents, par équipe, gouvernée.

## Bloc 3.4 — B2B : abonnement par siège & onboarding
- [x] Abonnement B2B par siège : `Subscription` Stripe **directe** sur le compte
  plateforme (pas de transfert Connect) — paliers 49/99/299 €.
- [x] SSO Google/Microsoft (puis SAML/SCIM pour le palier Scale).
- [x] Offre d'**onboarding clé en main** : flux pour mandater Prompta ou un builder
  certifié à construire les premiers agents du client (commission plateforme).
- **DoD :** une entreprise s'abonne par siège, avec SSO, et peut être accompagnée au
  démarrage.

**Définition de terminé Phase 3 :** boucle de croissance outillée, produit B2B
opérationnel.

---

# PHASE 4 — Industrialisation

## Bloc 4.1 — Planification d'agents
- [x] Permettre de programmer l'exécution récurrente d'un agent (cron par utilisateur) +
  envoi du résultat par email. Table `scheduled_runs`.
- **DoD :** un agent peut tourner automatiquement à intervalle régulier.

## Bloc 4.2 — Abonnement « Prompta Pro »
- [x] Table `platform_subscriptions` (migration 0013).
- [x] Abonnement plateforme unique donnant accès à tout le catalogue d'agents — UI + Stripe.
- [x] Revshare builders au prorata de l'usage (`platform_pro_usage`, cron `/api/cron/revshare`).
- **DoD :** un utilisateur Pro lance n'importe quel agent ; les builders sont rémunérés
  à l'usage.

## Bloc 4.3 — Sandbox pour code arbitraire
- [x] Intégrer E2B ou Modal pour exécuter des agents contenant du code arbitraire —
  réseau coupé sauf egress filtré, timeouts, quotas (`lib/agent/sandbox.ts` + `E2B_API_KEY`).
- **DoD :** un agent à code arbitraire s'exécute en isolation totale.

## Bloc 4.4 — Déploiement production
- [ ] Render : Web Service + worker d'exécution + Cron Jobs (badges, planification,
  ré-indexation, payouts) ; toutes les variables d'env.
- [ ] Stripe en mode **live** + webhooks de prod ; sauvegardes Supabase (PITR) vérifiées.
- [ ] Amorçage : 100–200 contenus de qualité.
- [x] Suite de tests **e2e** du parcours achat + run ; checklist d'accessibilité (`npm run test:e2e`).
- [ ] Alertes Sentry + Render ; monitoring des runs.
- **DoD :** l'app tourne en prod, parcours achat → exécution validé de bout en bout.

---

# Ordre de priorité

1. **Phase 0** — non négociable : sans modération, rien ne se publie.
2. **Phase 1** — le runtime et le double mode : le cœur du pivot, avec les assistants
   UX (Blocs 1.4 et 1.8) qui rendent le produit accessible.
3. **Phase 2** — la monétisation récurrente.
4. **Phase 3** — croissance et B2B.
5. **Phase 4** — industrialisation et mise en prod.

*Avance bloc par bloc, coche au fur et à mesure, garde `tsc` et `lint` au vert.*
