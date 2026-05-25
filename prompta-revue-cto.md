# Prompta — Revue CTO (audit approfondi & architecture cible)

> Document de référence consolidé. Il intègre la dernière décision produit (double mode
> **Copier / Lancer**) et passe en revue, à hauteur de CTO, l'UX/UI, le cycle de vie des
> clés API, la sécurité, l'architecture Stripe, la croissance, la modération et la dette
> technique. Il consolide `AUDIT.md`, `TODO-CURSOR.md` et les notes stratégiques.

---

## 0. Statut

- Code : Next.js 14 / Supabase / Stripe. Sprints 0–7 du `PLAN.md` quasi complets.
- Déjà livré dans cette mission : reskin (design du preview), pages `/teams` et légales,
  primitives UI, corrections TypeScript.
- Ce document décrit **l'état cible** et le chemin pour y aller. C'est la version qui
  fait autorité sur les volets exécution, paiement et modération.

---

## 1. Synthèse exécutive — le verdict CTO

Prompta a une base technique saine mais un **positionnement à durcir**. Trois vérités :

1. **Le produit n'est pas un catalogue, c'est un runtime.** La valeur défendable, c'est
   d'exécuter prompts et agents *sur* la plateforme. Le téléchargement reste une porte de
   sortie, pas le cœur.
2. **Le double mode est la bonne UX.** Au clic sur un prompt, l'utilisateur doit pouvoir
   **soit copier** le prompt et l'utiliser où il veut, **soit le lancer directement** sur
   Prompta s'il a configuré ses clés. Le premier garantit la valeur immédiate sans
   friction ; le second crée l'engagement et la rétention. Aucun des deux ne doit brider
   l'autre.
3. **Le chantier prioritaire reste la modération.** Aujourd'hui « Publier » fige le
   statut à `under_review` et **rien ne le débloque** : en l'état, plus rien ne se publie.
   C'est un bug bloquant, pas une amélioration.

Risque principal à surveiller : on empile des fonctionnalités (runtime, abonnements,
B2B) sur une couche de **modération et de sécurité encore incomplète**. La règle CTO :
**aucune nouvelle surface d'exécution n'est ouverte avant que la modération et le
cloisonnement des secrets soient solides.**

---

## 2. Le parcours utilisateur cible — double mode Copier / Lancer

### 2.1 Le principe

Quand l'utilisateur ouvre la fiche d'un prompt, deux chemins coexistent :

- **Copier** — toujours disponible (pour un prompt gratuit ; pour un payant, après
  achat). L'utilisateur récupère le texte et l'utilise sur l'outil de son choix
  (ChatGPT, Claude, Gemini…).
- **Lancer sur Prompta** — disponible **uniquement si l'utilisateur a configuré les
  clés API requises**. Sinon, le bouton invite à les configurer (sans bloquer la copie).

Principe directeur : **la plateforme doit être pleinement utile sans aucune clé.** Le
mode « Lancer » est un *confort d'engagement*, pas un mur. Un utilisateur non configuré
ne doit jamais ressentir une version mutilée du produit.

### 2.2 Matrice par type de contenu

| Type | Copier | Lancer sur Prompta | Télécharger le bundle |
|---|---|---|---|
| **Prompt** | ✅ (cœur de l'usage) | ✅ si clés configurées | — |
| **Workflow** | ⚠️ partiel (chaîne en texte) | ✅ recommandé | optionnel |
| **Agent** | ❌ (multi-étapes + outils, non copiable) | ✅ recommandé | ✅ fallback |

> Un agent ne se « copie » pas : il s'exécute ou se télécharge. La copie est l'usage
> naturel du prompt simple ; l'exécution est l'usage naturel de l'agent.

### 2.3 UI — la fiche prompt et le masque

**Sur la fiche**, un bloc « Utiliser ce prompt » avec deux onglets :

```
┌──────────────────────────────────────────────┐
│  Utiliser ce prompt                            │
│  [ Copier ]   [ Lancer ici ]                   │  ← onglets
├──────────────────────────────────────────────┤
│  ONGLET « COPIER »                             │
│   Variables (optionnel) :                      │
│    • secteur   [__________]                    │
│    • prospect  [__________]                    │
│   ( ◯ Copier le modèle  ◉ Copier rempli )      │
│            [  Copier le prompt  ]              │
│   ↳ Collez-le dans ChatGPT, Claude, Gemini…    │
├──────────────────────────────────────────────┤
│  ONGLET « LANCER ICI »                         │
│   Mêmes variables + sélecteur de modèle         │
│   Connexions requises :                         │
│    ✓ OpenAI         connectée                   │
│    ⚠ Serper.dev     à renseigner   [ + ]        │
│   Coût estimé : ~0,04 € (votre clé)             │
│            [  Lancer l'exécution  ]            │
│   ⚙ Pas encore de clés ? → Configurer (1 min)  │
└──────────────────────────────────────────────┘
```

États du bouton « Lancer » :
- **Prêt** — toutes les clés requises sont connectées → bouton actif, primaire.
- **À configurer** — une clé manque → bouton en état invitant (« Configurez vos clés
  pour lancer ici »), ouvre la saisie inline ou l'écran Connexions. La copie reste
  pleinement disponible à côté.
- **Payant non acheté** — les deux onglets sont remplacés par « Acheter — X € » ; après
  achat, le bloc complet apparaît.

Micro-UX à soigner :
- Le bouton « Copier » donne un retour visuel immédiat (« Copié ✓ »).
- « Copier rempli » ne s'active que si les variables obligatoires sont renseignées.
- Le coût estimé s'affiche **avant** le lancement ; confirmation au-delà d'un seuil.
- Résultat d'exécution **streamé** en direct, avec historique des runs et « relancer ».
- Sur mobile, les onglets passent en deux gros boutons empilés.

### 2.4 Ne jamais brider l'utilisateur sans clés

C'est un choix de conception, pas un détail : un prompt gratuit reste **copiable
intégralement** même sans clé. Le mode « Lancer » est l'**hameçon** (engagement,
données d'usage, futur abonnement aux agents), jamais une rançon. On guide vers la
configuration des clés par la valeur (« lancez-le ici en 1 clic »), pas par le blocage.

---

## 3. Cycle de vie des clés API — revue complète

L'utilisateur final doit pouvoir renseigner, gérer **et supprimer** ses clés. C'est un
sous-système à part entière, pas un champ de formulaire.

### 3.1 Les opérations

| Opération | Comportement attendu |
|---|---|
| **Ajouter** | Saisie dans « Mes connexions » ou inline dans le masque. Test de validité en direct (un appel minimal au fournisseur). |
| **Lister** | Seuls les **4 derniers caractères** affichés (`sk-…a3f9`) + état (valide / invalide / non testée). |
| **Tester / revalider** | Bouton de re-test ; un échec passe la clé en « invalide ». |
| **Faire tourner (rotation)** | Remplacer la valeur d'une clé sans recréer l'entrée. |
| **Supprimer / révoquer** | **Hard-delete** de la valeur chiffrée. Voir 3.2. |
| **Détection d'expiration** | Si un run échoue pour cause d'auth fournisseur, la clé bascule « invalide » et l'utilisateur est invité à la re-saisir. |

### 3.2 L'impact des suppressions — le point sensible

Supprimer une clé n'est pas neutre : des prompts/agents en dépendent.

- **Avant suppression**, afficher un récap : « Cette clé OpenAI est utilisée par 3 agents
  abonnés. Sans elle, ils ne pourront plus tourner. » → confirmation explicite.
- **Après suppression** : les exécutions concernées échouent proprement avec un message
  clair (« clé OpenAI manquante ») et un lien direct pour en reconnecter une — jamais une
  erreur technique brute.
- **Abonnement à un agent ≠ clé** : supprimer sa clé ne résilie pas l'abonnement (le
  builder garde son MRR). L'agent redevient exécutable dès qu'une clé valide est
  reconnectée. Ne pas coupler les deux.
- **Niveau organisation (B2B)** : la suppression d'une clé org par un admin affecte
  **tous** les sièges → avertissement renforcé + log d'audit.
- **Sécurité de l'effacement** : pas de soft-delete pour un secret. La ligne et la valeur
  chiffrée sont réellement détruites.

### 3.3 Modèle de données & règles

- Table `user_api_keys` (et `org_api_keys`) : `owner_id`, `provider`, `encrypted_key`,
  `last4`, `is_valid`, `last_checked_at`, `created_at`.
- **RLS stricte** : un utilisateur ne lit que ses clés ; **aucune route** ne renvoie
  `encrypted_key` au client.
- Journal d'audit `key_events` : ajout / rotation / suppression (jamais la valeur).
- Chiffrement : voir §4.

---

## 4. Sécurité — revue CTO

Classée par surface, du plus critique au plus courant.

### 4.1 Secrets & clés API
- Chiffrement **au repos** (libsodium *sealed box* ou un KMS). La clé de chiffrement
  serveur n'est **jamais** dans le code ni exposée au client.
- Déchiffrement **côté serveur uniquement**, en mémoire, le temps de l'appel.
- Clé **jamais** renvoyée au navigateur, **jamais** loggée, **jamais** visible d'un
  builder. Aucune exception.
- `service_role` Supabase : serveur uniquement.

### 4.2 Contenu payant
- Le `prompt_body` est tronqué **côté serveur** tant que l'achat n'est pas vérifié —
  jamais simplement masqué en CSS (déjà respecté dans le code actuel, à préserver).

### 4.3 Exécution non fiable (le runtime)
- Liste blanche stricte d'outils ; l'agent ne peut pas en invoquer d'autres.
- `http_fetch` avec **filtrage d'egress** : interdiction des IP privées / réseau interne
  → empêche l'exfiltration et le SSRF.
- Plafonds par run : `max_steps`, `max_tokens`, `timeout`. Anti-boucle.
- Scan des **sorties** : un agent qui produit du spam, du scraping massif ou du contenu
  interdit doit être détecté et suspendu.
- V1 = agents **déclaratifs** (étapes JSON), **pas de code arbitraire**. Le code
  arbitraire impose une sandbox (E2B/Modal) — chantier séparé, plus tard.

### 4.4 Paiements
- Vérification **systématique** de la signature des webhooks Stripe.
- Clés d'**idempotence** sur les routes de paiement.
- Toute écriture sensible (achats, payouts, abonnements) passe par une **route serveur**.

### 4.5 Plateforme
- **Rate limiting** sur : checkout, download, webhooks, exécution d'agents, auth.
- Scan des **bundles** déposés (secrets, code suspect, liens d'exfiltration).
- Validation **Zod** de toutes les entrées (formulaires, manifestes, API).
- Headers de sécurité (CSP, HSTS), protection CSRF sur les mutations.
- Supply chain : `npm audit` en CI, lockfile figé, mises à jour suivies.

### 4.6 Données & conformité
- **RGPD** : registre des traitements, export et suppression de compte, DPA avec les
  sous-traitants (Supabase, Stripe, Resend, PostHog, Sentry, fournisseurs LLM).
- **Cloisonnement runtime** : quand un agent tourne, les données de l'acheteur transitent
  par la logique du builder — elles ne doivent **jamais** être loggées côté builder ni
  lui être accessibles.
- Logs structurés, pas de secret ni de PII dans les logs.

---

## 5. Architecture Stripe — les trois flux

Prompta a aujourd'hui **trois** flux de paiement distincts. Les confondre est une source
de bugs ; il faut les traiter séparément.

### 5.1 Stripe Connect — payouts des builders
- Onboarding **Connect Express** depuis `/dashboard/payouts` → ligne `stripe_accounts`.
- Écouter `account.updated` pour suivre `charges_enabled` **et** `payouts_enabled` (KYC).
- **Garde-fou** : impossible d'acheter / s'abonner à un contenu dont le créateur n'est
  pas KYC-complet → `BuyButton` désactivé avec message explicite.

### 5.2 Achats uniques — prompts payants
- `PaymentIntent` avec `application_fee_amount` (commission plateforme, ~20 %) et
  `transfer_data.destination` = compte Connect du builder.
- Webhook `payment_intent.succeeded` → créer `purchase` + `download`, débloquer le
  contenu, envoyer le reçu (Resend).
- Gérer `charge.refunded` et les litiges → statut de `purchase`.

### 5.3 Abonnements — agents & sièges B2B (nouveau)
Deux sous-cas, **à ne pas mélanger** :

- **Abonnement à un agent** (utilisateur → builder) : `Subscription` sur le compte
  plateforme avec `application_fee_percent` + `transfer_data.destination` vers le compte
  Connect du builder. Le builder touche du MRR, la plateforme sa commission.
- **Abonnement B2B par siège** (entreprise → Prompta) : `Subscription` **directe** sur le
  compte plateforme — c'est ton revenu SaaS, pas de transfert Connect.

Éléments transverses des abonnements :
- Webhooks : `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`,
  `customer.subscription.deleted`.
- **Dunning** : un paiement échoué déclenche les relances Stripe ; à l'échec final,
  **suspendre l'accès à l'agent** (période de grâce courte avant coupure).
- **Customer Portal** Stripe : l'utilisateur gère/annule ses abonnements et met à jour
  sa carte sans support.
- **Stripe Tax** : TVA UE automatique ; stocker `tax_cents` sur la transaction.
- **Test clocks** Stripe pour tester les cycles de facturation en recette.

### 5.4 Configuration & environnements
- **Clés et webhooks séparés** test vs live ; secret de webhook par environnement.
- Variables : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID`,
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (déjà dans `lib/env.ts`).
- Endpoint webhook unique, **routage par type d'événement** en interne.
- Idempotence sur toutes les écritures déclenchées par webhook (un événement peut
  arriver deux fois).
- Passage en **live** : checklist dédiée (Sprint 11) — webhooks de prod, comptes Connect
  réels, Stripe Tax activé.

---

## 6. Croissance & promotion builder

Un builder qui fait rayonner son travail = acquisition gratuite. À outiller.

### 6.1 Partage LinkedIn du dernier prompt
- Sur chaque listing du dashboard builder : bouton **« Promouvoir »** → ouvre un partage
  LinkedIn pré-rempli (`https://www.linkedin.com/sharing/share-offsite/?url=…`) pointant
  vers la fiche publique.
- Texte suggéré pré-écrit (titre, bénéfice, lien) que le builder peut éditer.

### 6.2 Certification LinkedIn
- Sur `/u/[username]`, encart « Ajouter ma certification sur LinkedIn » : partage du
  badge (« Top 1 % Vente ») et des stats publiques. Boucle de réputation exportable.

### 6.3 Fiche synthèse & images OG dynamiques
- **Images Open Graph générées dynamiquement** (`next/og` / `ImageResponse`) : quand on
  partage une fiche listing ou un profil, le lien se déplie en **carte visuelle**
  soignée (titre, note, téléchargements, créateur, badge). Identité du preview respectée.
- **Fiche synthèse builder** : une page/carte récapitulative auto-générée (stats, top
  prompts, badges) que le builder peut partager ou exporter en image — utilisable sur
  LinkedIn, en signature, en portfolio.
- Effet : chaque partage devient une mini-publicité cohérente → boucle virale.

### 6.4 Autres leviers
- Essais gratuits de runs d'agents (« essayer avant d'acheter ») = levier de conversion.
- Pages catégories `/c/[slug]` indexables (SEO) ; données structurées Product/Review.

---

## 7. Modération — le système complet

La modération n'est pas une page : c'est un **pipeline** à plusieurs étages.

### 7.1 Pré-publication (automatique)
Au dépôt, avant tout passage en `published` :
- Scan de **secrets / clés réelles** dans les bundles et `.env` (déjà partiellement en
  place via `lib/secrets-scanner.ts`).
- Scan de **code suspect** et de **liens d'exfiltration**.
- Scan de **contenu** : motifs de jailbreak, NSFW, désinformation, illégal, sur
  `description` + `prompt_body`.
- Tout hit → le contenu reste en `under_review` avec un motif ; jamais publié
  automatiquement.

### 7.2 File de revue humaine (le manque bloquant actuel)
- Back-office admin `/admin/moderation` (rôle `is_admin` sur `profiles`, RLS dédiée).
- Liste des `under_review` : titre, créateur, type, résultat des scans, aperçu.
- Actions **Approuver** (→ `published`) / **Refuser** (→ `rejected` + motif), via une
  route serveur en `service_role`.
- **Sans cet écran, rien ne se publie aujourd'hui.** Priorité absolue.

### 7.3 Post-publication
- Bouton **« Signaler »** sur chaque fiche → `moderation_flags`.
- Onglet « Signalements » dans le back-office : traiter, suspendre, retirer (takedown).
- Procédure de **takedown** documentée dans les CGU.

### 7.4 Modération du runtime
- Les **sorties** des exécutions on-platform sont scannées : un agent qui génère du spam,
  du scraping abusif ou du contenu interdit est **suspendu automatiquement**.
- Plafonds de débit par utilisateur/org pour éviter l'usage abusif du runtime.

### 7.5 Niveaux de confiance (pour que ça scale)
- **Nouveau builder** : revue humaine intégrale de chaque dépôt.
- **Builder établi / vérifié** : versions mineures auto-publiées, contrôles par
  **sondage** ; revue complète seulement sur version majeure.
- **Éval automatique périodique** : on rejoue les jeux de test des agents ; un agent
  cassé (modèle qui a changé) est signalé et son badge « vérifié » retiré.
- À volume élevé, on ne peut pas tout relire → pondération par réputation + sondage +
  classifieurs. Modération communautaire envisageable plus tard.

### 7.6 Outillage & métriques
- Tableau de bord admin : file, filtres, actions groupées, **journal d'audit** de toutes
  les décisions de modération.
- Gestion des comptes : suspendre / bannir un utilisateur, retirer un contenu.
- **Appel** : un builder refusé peut contester.
- KPIs suivis : délai moyen de revue, taux de rejet, taux de signalement, faux positifs
  des scans.

---

## 8. État du code vs cible — audit consolidé

| Domaine | État | À faire |
|---|---|---|
| Auth & profils | ✅ Fonctionnel | Reskin profil au design preview |
| Dépôt & versioning | ✅ Fonctionnel | Éditeur visuel d'agents (manifeste) |
| Découverte / SEO | ⚠️ Partiel | Pages `/c/[slug]`, ISR, JSON-LD, OG dynamiques |
| Paiements | ⚠️ Achats OK | Abonnements, KYC complet, Stripe Tax, reçus Resend |
| Téléchargement | ✅ Fonctionnel | — |
| Réseau (follow/avis) | ✅ Fonctionnel | Badges auto, partage LinkedIn, fiche synthèse |
| Hybride / partenaires | ⚠️ Partiel | Tracking PostHog des clics sortants |
| **Modération** | ❌ **Bloquant** | File de validation admin, filtres de contenu |
| **Runtime d'exécution** | ❌ Absent | Passerelle modèles, masque, clés API, orchestrateur |
| Sécurité | ⚠️ Partiel | Rate limiting, chiffrement des clés, cloisonnement |
| Légal | ⚠️ Gabarits | CGU/CGV/confidentialité à valider, procédure takedown |
| Déploiement | ❌ À faire | Render, cron jobs, Stripe live, sauvegardes |

---

## 9. Registre des risques (vue CTO)

| Risque | Gravité | Mitigation |
|---|---|---|
| Rien ne se publie (modération incomplète) | 🔴 Critique | Back-office admin — Phase 0 |
| Fuite / mauvaise gestion des clés API | 🔴 Critique | Chiffrement, RLS, jamais exposées, hard-delete |
| Exfiltration via agents (SSRF, injection) | 🔴 Critique | Liste blanche d'outils, filtrage d'egress, déclaratif only |
| Coût LLM non maîtrisé sur les runs gratuits | 🟠 Élevé | BYOK par défaut + quota gratuit plafonné |
| Responsabilité RGPD sur les données de run | 🟠 Élevé | DPA, cloisonnement, logs sans PII |
| Dépendance à un fournisseur LLM unique | 🟠 Élevé | Passerelle multi-modèles + fallback |
| Agents qui cassent quand les modèles changent | 🟡 Moyen | Éval auto périodique, versioning, badge retiré |
| Cold-start du marketplace | 🟡 Moyen | Amorçage 100–200 contenus, import vers B2B |
| Webhooks Stripe rejoués / non vérifiés | 🟡 Moyen | Signature + idempotence systématiques |
| Dette : pas de tests e2e sur l'achat | 🟡 Moyen | Suite e2e parcours achat avant le live |

---

## 10. Feuille de route consolidée

### Phase 0 — Débloquer & sécuriser (avant toute nouveauté)
- [ ] Back-office de modération `under_review → published`.
- [ ] Filtres de contenu + scan étendu des bundles.
- [ ] Rate limiting sur les routes sensibles.
- [ ] Finir le reskin (profil, dashboard, auth) ; pages légales validées.

### Phase 1 — Le runtime & le double mode
- [ ] Passerelle modèles multi-fournisseurs (+ fallback).
- [ ] Écran « Mes connexions » + table `user_api_keys` chiffrée + cycle de vie complet
  (ajout, test, rotation, **suppression avec avertissement d'impact**).
- [ ] Masque d'exécution à **deux onglets : Copier / Lancer ici**.
- [ ] Run de prompt en un clic (BYOK ou quota gratuit plafonné), résultat streamé.
- [ ] Manifeste `agent.json` + éditeur visuel + playground + orchestrateur + outils
  en liste blanche.

### Phase 2 — Monétisation récurrente
- [ ] Abonnement à l'agent (Stripe Connect + `application_fee_percent`), BYOK par défaut.
- [ ] Customer Portal, dunning, Stripe Tax, reçus Resend.
- [ ] KYC builder complet ; tableau de revenus builder (MRR).
- [ ] Galop d'essai (runs gratuits) ; mode crédits plateforme en option confort.

### Phase 3 — Croissance & B2B
- [ ] OG images dynamiques + fiche synthèse + partage LinkedIn (promotion builder).
- [ ] Badges automatiques (cron) ; pages `/c/[slug]` ; ISR + JSON-LD.
- [ ] Organisations, rôles, espaces, clés au niveau org, import marketplace → privé.
- [ ] Abonnement B2B par siège (Stripe direct) ; onboarding clé en main.

### Phase 4 — Industrialisation
- [ ] Planification d'agents ; abonnement « Prompta Pro » (revshare à l'usage).
- [ ] Sandbox pour code arbitraire (E2B/Modal).
- [ ] Déploiement prod : Render, cron, Stripe live, sauvegardes PITR, tests e2e.

---

## 11. Décisions à acter

1. **Double mode** : tout prompt offre **Copier** (toujours, gratuit ou après achat) et
   **Lancer ici** (si clés configurées). La copie n'est jamais bridée.
2. **La modération passe avant le runtime.** Phase 0 non négociable.
3. **Clés API** : sous-système à part entière — écran dédié, cycle de vie complet,
   suppression avec avertissement d'impact, chiffrement et cloisonnement stricts.
4. **Trois flux Stripe distincts** : Connect (payouts), achats uniques, abonnements
   (agents via Connect / sièges B2B en direct). Ne jamais les confondre.
5. **Croissance outillée** : OG dynamiques, fiche synthèse et partage LinkedIn font
   partie du produit, pas d'un « plus tard ».
6. **Un seul moteur** sert le marketplace public et le B2B.

---

*Fil rouge CTO : on ne construit pas une nouvelle surface (runtime, paiement, B2B) sur
une couche de modération et de sécurité incomplète. Débloquer et sécuriser d'abord ;
exécuter et monétiser ensuite ; industrialiser enfin.*
