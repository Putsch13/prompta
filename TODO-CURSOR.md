# TODO Cursor — Prompta (suite après audit)

> **Mode d'emploi.** Place ce fichier à la racine du repo. Travaille **bloc par bloc,
> de haut en bas**. Pour chaque bloc, demande à Cursor :
> *« Lis TODO-CURSOR.md, implémente le Bloc X, coche les tâches faites, ne touche pas
> aux autres blocs. »*
> Ne passe au bloc suivant que quand la **Définition de terminé** est verte.
> Après chaque bloc : `npx tsc --noEmit` et `npm run lint` doivent passer.

**Conventions du projet** (déjà en place, à respecter) :
- Design tokens dans `tailwind.config.ts` : `bg / card / card2 / line / line-soft /
  ink / ink-soft / ink-faint / accent / accent-dim / star`, `max-w-page` (1180px).
- Polices : `font-display` (titres), `font-body` (texte), `font-mono` (code).
- Primitives réutilisables : `components/ui.tsx` (`Kicker`, `Stars`, `TypeBadge`,
  `PriceTag`, `TypeIcon`, `fmt`) et `components/PromptCard.tsx`.
- Écritures sensibles → routes API serveur avec `service_role`, jamais le client.
- Toujours réutiliser ces primitives plutôt que de recréer des styles.

---

## BLOC A — Finir le reskin (parité visuelle totale avec le preview)

> Le header, le footer, l'accueil, l'explore et la fiche listing sont déjà au design
> du preview. Restent le profil, le dashboard, l'auth et l'écran post-achat.

### A1. Page profil `/u/[username]` — `app/u/[username]/page.tsx`
- [x] Bannière dégradée en haut : `height 100px`, `background: linear-gradient(115deg,
  #0A66C2 0%, #378FE9 100%)`.
- [x] Avatar à initiales `86×86`, rond, bordure blanche `4px`, remonté de `-40px` sur la
  bannière. Nom en `font-display`, `CheckCircle2` bleu si `is_verified`.
- [x] Ligne meta : `MapPin` + localisation · `Users` + nb d'abonnés (`fmt()`).
- [x] Boutons « Suivre » (`FollowButton`, déjà existant) + « Message » à droite.
- [x] Rangée de badges (pilules) sous la bio — premier badge en bleu plein, les autres
  en `card2`.
- [x] Grille de stats 4 colonnes : Téléchargements / Note moyenne / Prompts publiés /
  Revenus, chaque cellule avec icône `accent` + chiffre `font-display`.
- [x] Encart LinkedIn (carte `accent-light`, bordure `accent`) — voir tâche **D2**.
- [x] Onglets « Prompts / Avis / Activité ». L'onglet Prompts affiche les `PromptCard`
  du créateur ; Activité = timeline verticale (points bleus reliés par un trait).
- **DoD :** le profil est visuellement identique au preview, données réelles Supabase.

### A2. Dashboard — `app/dashboard/page.tsx`, `app/dashboard/layout.tsx`
- [x] Reskin au thème crème : cartes `bg-card border-line rounded-xl`, titres
  `font-display`, chiffres clés en gros `font-display`.
- [x] Cartes de stats (vues / téléchargements / revenus / note) en grille, style identique
  à la grille de stats du profil.
- [x] Liste des listings du builder en `PromptCard` ou en lignes compactes cohérentes.
- **DoD :** le dashboard utilise les tokens et les primitives, plus aucune classe
  `text-gray-*` / `bg-gray-*` résiduelle.

### A3. Sous-pages dashboard — `new`, `edit-profile`, `payouts`, `listing/[id]/edit`
- [x] Reskin des formulaires : `input/textarea/select` en `h-10 rounded-lg border-line
  bg-card`, labels `font-body text-[11px] font-bold uppercase`.
- [x] Boutons primaires `bg-accent text-white rounded-lg`, secondaires `border-line`.
- [x] Le bloc « Environnement » de `dashboard/new` reprend les libellés du preview
  (Clés API requises, Variables, Dépendances, Temps de setup).
- **DoD :** parcours de dépôt complet au design du preview.

### A4. Pages d'auth — `app/(auth)/login`, `signup`, `onboarding`
- [x] Carte centrée `max-w-[420px]`, `bg-card border-line rounded-xl`, sur fond crème.
- [x] Logo « Prompta + point bleu » en haut, titres `font-display`.
- [x] Champs et boutons cohérents avec A3.
- **DoD :** login/signup/onboarding au design du preview.

### A5. Écran post-achat — `components/BuyButton.tsx` (+ page de retour)
- [x] Après paiement réussi, afficher l'écran « Paiement confirmé » du preview : pastille
  ronde `Check` en `accent-light`, titre `font-display`, liste du bundle inclus en
  `font-mono`, bouton « Télécharger le bundle (.zip) ».
- [x] Conserver le flux Stripe réel (route serveur) — ne pas simuler le paiement.
- **DoD :** retour de checkout habillé comme le preview, téléchargement fonctionnel.

**Définition de terminé du Bloc A :** toutes les pages publiques et privées partagent
la même identité visuelle que `prompta-preview-2.jsx`.

---

## BLOC B — Sécurité & modération (Sprint 8) ⚠️ PRIORITÉ HAUTE

> Aujourd'hui « Publier » passe le statut à `under_review` mais rien ne le fait passer à
> `published` : **plus aucun contenu ne devient public**. C'est bloquant.

### B1. Rôle admin
- [x] Migration `supabase/migrations/0004_admin_role.sql` : ajouter
  `is_admin boolean default false` sur `profiles`. RLS : seul un admin peut lire/écrire
  les tables de modération.
- [x] Helper `lib/auth.ts` : `requireAdmin()` (vérifie la session + `is_admin`, redirige
  sinon).

### B2. Back-office de modération — `app/admin/moderation/page.tsx`
- [x] Page protégée par `requireAdmin()`.
- [x] Liste des `listings` en statut `under_review` avec : titre, créateur, type, date,
  résultat du scan de secrets, aperçu de la description.
- [x] Actions « Approuver » (→ `published`) et « Refuser » (→ `rejected` + motif) via une
  route serveur `app/api/admin/moderate/route.ts` (`service_role`).
- [x] Onglet « Signalements » : liste des `moderation_flags` ouverts, action « Traiter ».
- **DoD :** un admin peut approuver/refuser un listing ; un contenu refusé n'apparaît
  jamais dans `/explore`.

### B3. Filtres de contenu — `lib/content-filter.ts`
- [x] Fonction `scanContent(text)` qui détecte : motifs de jailbreak (« ignore previous
  instructions », « DAN », etc.), NSFW, incitation illégale, désinformation flagrante.
- [x] Appeler `scanContent` sur `description` + `prompt_body` au moment du dépôt ; en cas
  de hit, marquer le listing pour revue manuelle (jamais publié automatiquement).
- **DoD :** un dépôt suspect est signalé et bloqué en `under_review` avec un motif.

### B4. Rate limiting — `lib/rate-limit.ts` + `middleware.ts`
- [x] Limiteur par IP/utilisateur (Upstash Redis recommandé, sinon LRU en mémoire).
- [x] Appliquer sur `api/stripe/checkout`, `api/download/[versionId]`,
  `api/webhooks/stripe`, et les routes d'auth. Réponse `429` si dépassement.
- **DoD :** un flood sur ces routes renvoie `429` au-delà du seuil.

### B5. Pages légales
- [x] `/legal/terms` et `/legal/privacy` existent (gabarits) → les faire **valider par un
  juriste**, compléter avec une procédure de **takedown** (retrait sur signalement).
- **DoD :** CGU/CGV/confidentialité/PI publiées et complètes.

**Définition de terminé du Bloc B :** rien n'est publié sans validation ; un contenu
dangereux peut être bloqué et retiré ; routes sensibles protégées.

---

## BLOC C — Paiements : reliquats (Sprint 4)

### C1. KYC créateur
- [x] Dans `app/api/stripe/checkout/route.ts`, refuser l'achat si le `stripe_accounts` du
  créateur n'a pas **`charges_enabled` ET `payouts_enabled`** à `true`.
- [x] Sur la fiche listing, si le créateur n'est pas KYC-complet, désactiver `BuyButton`
  avec un message explicite.
- **DoD :** impossible d'acheter à un créateur non vérifié.

### C2. Stripe Tax (TVA)
- [x] Activer Stripe Tax dans le PaymentIntent (`automatic_tax: { enabled: true }`).
- [x] Stocker le montant de taxe dans une colonne `tax_cents` de `purchases`
  (migration `0005_purchase_tax.sql`).
- **DoD :** la TVA UE est calculée et enregistrée par achat.

### C3. Reçus par email (Resend) — `lib/email.ts`
- [x] Client Resend + template de reçu (titre du listing, montant, TVA, date, lien de
  téléchargement).
- [x] Dans le webhook `payment_intent.succeeded`, après création du `purchase`, envoyer
  le reçu à l'acheteur.
- [x] Email de notification de vente au créateur (optionnel mais recommandé).
- **DoD :** chaque achat déclenche un reçu par email.

**Définition de terminé du Bloc C :** parcours d'achat conforme fiscalement, KYC vérifié,
reçus envoyés.

---

## BLOC D — Réseau : reliquats (Sprint 6)

### D1. Badges automatiques
- [x] Migration `0007_seed_badges.sql` : insérer les badges de base dans `badges`
  (`verified`, `downloads_1k`, `downloads_10k`, `downloads_100k`, `top_1pct_category`).
- [x] Route cron `app/api/cron/badges/route.ts` (protégée par un secret d'en-tête) qui
  recalcule et insère dans `creator_badges` selon : `is_verified`, paliers de
  téléchargements cumulés, top 1 % par catégorie.
- [ ] Déclarer un **Render Cron Job** quotidien sur cette route.
- **DoD :** les badges s'attribuent automatiquement et s'affichent sur `/u/[username]`.

### D2. Bouton « Ajouter ma certification sur LinkedIn »
- [x] Sur `/u/[username]`, encart (carte `accent-light`, bordure `accent`) avec un bouton
  qui ouvre `https://www.linkedin.com/sharing/share-offsite/?url=<URL_du_profil_public>`.
- [x] Texte du preview : « Transformez votre réputation en preuve professionnelle ».
- **DoD :** le builder peut partager sa certification Prompta en un clic sur LinkedIn.

**Définition de terminé du Bloc D :** réputation publique exportable, badges vivants.

---

## BLOC E — Hybride : tracking partenaires (Sprint 7)

### E1. Tracking des clics sortants
- [x] Dans `components/RunPartnerButton.tsx`, émettre un event PostHog
  `partner_run_click` (props : `listing_slug`, `partner_name`) **avant** la redirection.
- [x] Vérifier que `lib/posthog.ts` est bien initialisé côté client.
- **DoD :** chaque clic « Exécuter dans [outil] » est mesuré dans PostHog.

> *(Optionnel V1.1)* Exécution sandboxée d'agents — hors périmètre, à isoler totalement
> si un jour implémenté.

---

## BLOC F — SEO, analytics & monitoring (Sprint 9)

### F1. ISR + canonical sur les fiches
- [x] Remplacer `export const dynamic = "force-dynamic"` par
  `export const revalidate = 3600` dans `app/listing/[slug]/page.tsx`.
- [x] Ajouter `alternates: { canonical: ... }` dans `generateMetadata`.
- **DoD :** les fiches sont en ISR avec URL canonique.

### F2. Données structurées JSON-LD
- [x] Injecter un `<script type="application/ld+json">` `Product` + `AggregateRating`
  dans la fiche listing (note moyenne, nb d'avis, prix, devise).
- **DoD :** test Rich Results Google valide.

### F3. Pages catégories `/c/[slug]` — `app/c/[slug]/page.tsx`
- [x] Vraie landing par catégorie (titre, description SEO, grille de `PromptCard`),
  indexable, en ISR.
- [x] L'accueil et l'explore pointent vers `/c/[slug]` au lieu de `/explore?q=`.
- [x] Ajouter les URLs catégories dans `app/sitemap.ts`.
- **DoD :** chaque catégorie est une landing SEO autonome.

### F4. Funnel builder (PostHog)
- [x] Dans le dashboard, afficher le funnel vues → téléchargements → revenus à partir des
  events PostHog. *(Configuration PostHog dashboard requise)*
- **DoD :** le builder voit son entonnoir de conversion.

### F5. Monitoring & performance
- [x] Alertes Sentry (erreurs) + alertes Render (latence). *(Configuration Sentry/Render requise)*
- [x] `next/image` partout, lazy-loading, contrôle des Core Web Vitals.
- **DoD :** erreurs remontées, Lighthouse correct.

---

## BLOC G — Données & cohérence (transverse)

### G1. Vue SQL `listing_stats`
- [x] Migration `0006_listing_stats.sql` : vue agrégeant par listing la **note moyenne**,
  le **nombre d'avis** et le **nombre de téléchargements**.
- [x] Joindre cette vue dans `app/explore/page.tsx` et l'accueil pour alimenter
  `rating / reviews / downloads` des `PromptCard` (le composant les gère déjà).
- **DoD :** les cartes affichent note + avis + téléchargements réels, sans N+1.

### G2. Cohérence des catégories
- [x] L'accueil affiche 9 catégories en dur → les remplacer par un fetch de la table
  `categories` (avec compteurs réels via `listing_stats` ou un `count`).
- [x] Vérifier que les `slug` correspondent à ceux utilisés par `/c/[slug]` et l'explore.
- **DoD :** une seule source de vérité pour les catégories.

---

## BLOC H — Déploiement & lancement (Sprint 11)

- [ ] Render : Web Service branché sur le repo, `next build` / `next start`, **toutes** les
  variables de `lib/env.ts` renseignées.
- [ ] Domaine custom + HTTPS.
- [ ] Stripe en mode **live** + webhooks de prod (vérifier la signature).
- [ ] Render Cron Jobs : badges (Bloc D1), ré-indexation, payouts.
- [ ] Sauvegardes Supabase (Point-in-Time Recovery) vérifiées.
- [ ] Amorçage : 100–200 prompts/agents de qualité (anti cold-start).
- [ ] Emails transactionnels testés, checklist d'accessibilité, tests e2e du parcours
  d'achat.
- **DoD :** l'app tourne en prod, le parcours achat → téléchargement est validé de bout
  en bout.

---

## BLOC I — B2B / Teams, produit (Sprint 10, post-V1)

> La page marketing `/teams` existe déjà. Ici il s'agit du **produit** Teams.

- [ ] Notion d'**organisation** : table `organizations`, `org_members` (rôles
  admin/éditeur/lecteur), RLS par org.
- [ ] Bibliothèque **privée** d'entreprise (listings internes, visibles seulement par
  l'org).
- [ ] Espaces par département (RH, SAV, Sales…).
- [ ] Validation interne + versioning des prompts d'équipe.
- [ ] SSO Google / Microsoft, puis SAML / SCIM pour le plan Scale.
- [ ] Facturation par siège via Stripe Subscriptions (49 / 99 / 299 €/mois).
- [ ] Audit log & gouvernance IA.
- **DoD :** une entreprise gère ses prompts en privé, par équipe, avec SSO et facturation
  par siège.

---

## Ordre de priorité recommandé

1. **Bloc B** (modération) — bloquant : sans lui rien ne se publie.
2. **Bloc C** (paiements) — conformité fiscale et KYC avant toute vente réelle.
3. **Bloc A** (reskin restant) — cohérence visuelle complète.
4. **Bloc G** (données) — fiabilise l'affichage des cartes.
5. **Bloc D** puis **E** (réputation, tracking).
6. **Bloc F** (SEO/analytics) — levier de croissance.
7. **Bloc H** (déploiement) — mise en prod.
8. **Bloc I** (Teams) — post-V1.

---

*Avance bloc par bloc, coche au fur et à mesure, garde `tsc` et `lint` au vert.*
