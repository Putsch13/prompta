# Prompta — Plan de production (TODO Cursor)

> **Comment utiliser ce fichier.** Colle-le à la racine du repo (`/PLAN.md`) et garde-le ouvert dans Cursor.
> Travaille **sprint par sprint, de haut en bas**. Avant chaque sprint, demande à Cursor :
> *« Lis PLAN.md, implémente le Sprint N, coche les tâches faites, ne touche pas aux sprints suivants. »*
> Ne passe au sprint suivant que quand le bloc **Définition de terminé** est vert.

---

## 1. Contexte & décisions validées

**Produit.** Marketplace + réseau social de prompts, agents et workflows IA (B2C et B2B).
Les builders publient ; les utilisateurs finaux téléchargent un **bundle complet prêt à tourner**
(prompt/agent + `.env.example` + variables + guide). Réputation type LinkedIn pour les builders.

**Décisions figées :**

| # | Décision | Choix |
|---|----------|-------|
| 1 | Agents | **Hybride** — distribution par défaut + bouton « Exécuter » via partenaires (affiliation/referral) |
| 2 | Monétisation V1 | **Marketplace payant** dès le départ, via Stripe Connect |
| 3 | Réseau social | **Léger** — profils publics, follow, badges, avis. Pas de feed en V1 |
| 4 | Stack | **Next.js + Render + Supabase** |

---

## 2. Stack technique

- **Frontend + API** : Next.js 14 (App Router, TypeScript) — déployé sur **Render** (Web Service)
- **Base de données / Auth / Storage** : **Supabase** (Postgres + Auth + Storage + RLS)
- **Paiements** : **Stripe** + **Stripe Connect** (Express) pour les payouts créateurs
- **Recherche** : Postgres full-text (`tsvector`) en V1 → Meilisearch plus tard
- **Jobs async / cron** : Render Cron Jobs (payouts, ré-indexation, scan)
- **Emails transactionnels** : Resend
- **Analytics produit** : PostHog · **Monitoring erreurs** : Sentry
- **UI** : Tailwind CSS + composants maison · icônes lucide-react
- **Validation** : Zod · **ORM/typed client** : `@supabase/supabase-js` (types générés)

---

## 3. Arborescence cible

```
prompta/
├─ app/
│  ├─ (marketing)/                 # pages publiques SEO
│  │  ├─ page.tsx                  # accueil = recherche + catégories
│  │  └─ teams/page.tsx            # B2B
│  ├─ explore/page.tsx             # résultats + filtres
│  ├─ listing/[slug]/page.tsx      # fiche prompt/agent (SSR, SEO)
│  ├─ u/[username]/page.tsx        # profil builder public
│  ├─ dashboard/                   # espace builder (privé)
│  │  ├─ page.tsx                  # analytics & revenus
│  │  ├─ new/page.tsx              # dépôt prompt/agent
│  │  └─ payouts/page.tsx          # Stripe Connect
│  ├─ api/
│  │  ├─ webhooks/stripe/route.ts
│  │  ├─ stripe/checkout/route.ts
│  │  ├─ stripe/connect/route.ts
│  │  └─ download/[versionId]/route.ts
│  ├─ layout.tsx
│  └─ globals.css
├─ components/                     # UI réutilisable
├─ lib/
│  ├─ supabase/{client,server,admin}.ts
│  ├─ stripe.ts
│  ├─ env.ts                       # validation Zod des env vars
│  └─ types.db.ts                  # types Supabase générés
├─ supabase/
│  └─ migrations/                  # SQL versionné
├─ middleware.ts                   # refresh session + routes privées
├─ .env.local
└─ PLAN.md
```

---

## 4. Schéma Supabase (migration initiale)

> À placer dans `supabase/migrations/0001_init.sql`. Active **RLS sur toutes les tables**.

```sql
-- Profils (1:1 avec auth.users)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  display_name text not null,
  headline text, bio text, location text, avatar_url text,
  is_verified boolean default false,
  created_at timestamptz default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null, name text not null, icon text
);

-- Listing = un prompt / agent / workflow
create table listings (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references profiles(id),
  category_id uuid references categories(id),
  type text not null check (type in ('prompt','agent','workflow')),
  title text not null, slug text unique not null, description text,
  models text[] default '{}', tags text[] default '{}',
  price_cents int default 0, currency text default 'eur',
  status text default 'draft'
    check (status in ('draft','under_review','published','rejected')),
  current_version_id uuid,
  search_vector tsvector,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- Versioning : un prompt évolue, on garde l'historique
create table listing_versions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  semver text not null, changelog text,
  prompt_body text,                       -- contenu (verrouillé si payant)
  env jsonb,                              -- clés, variables, deps, setup
  bundle_path text,                       -- chemin Supabase Storage (.zip)
  created_at timestamptz default now()
);

-- Compte Stripe Connect du builder
create table stripe_accounts (
  profile_id uuid primary key references profiles(id),
  stripe_account_id text not null,
  charges_enabled boolean default false,
  payouts_enabled boolean default false
);

-- Achats
create table purchases (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references profiles(id),
  listing_id uuid not null references listings(id),
  version_id uuid references listing_versions(id),
  amount_cents int not null, platform_fee_cents int not null,
  stripe_payment_intent text, status text default 'pending',
  created_at timestamptz default now()
);

-- Téléchargements (gratuits ET payants) — sert aux compteurs
create table downloads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  listing_id uuid not null references listings(id),
  version_id uuid references listing_versions(id),
  created_at timestamptz default now()
);

-- Avis : uniquement après achat/téléchargement vérifié
create table reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id),
  author_id uuid not null references profiles(id),
  rating int not null check (rating between 1 and 5),
  body text, verified boolean default true,
  created_at timestamptz default now(),
  unique (listing_id, author_id)
);

create table follows (
  follower_id uuid references profiles(id),
  creator_id uuid references profiles(id),
  created_at timestamptz default now(),
  primary key (follower_id, creator_id)
);

create table badges (id uuid primary key default gen_random_uuid(),
  slug text unique, label text);
create table creator_badges (
  creator_id uuid references profiles(id),
  badge_id uuid references badges(id),
  awarded_at timestamptz default now(),
  primary key (creator_id, badge_id)
);

-- Partenaires pour le mode hybride (bouton "Exécuter")
create table partner_integrations (
  id uuid primary key default gen_random_uuid(),
  name text, run_url_template text, affiliate_param text, active boolean default true
);

-- Modération
create table moderation_flags (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references listings(id),
  reason text, status text default 'open',
  created_at timestamptz default now()
);
```

**Politiques RLS clés :**

- `profiles`, `listings (status='published')`, `reviews`, `badges` → lecture publique.
- `listings` brouillon/refusé → lisible/éditable **uniquement par le `creator_id`**.
- `listing_versions.prompt_body` → exposer **tronqué** si payant et non acheté (faire ça côté API serveur, pas côté client).
- `purchases` / `downloads` → lisibles uniquement par le `buyer_id`/`user_id`.
- `reviews` INSERT → autorisé seulement si un `purchase`/`download` existe pour ce couple user+listing.
- Toutes les écritures sensibles (achats, payouts, stats) passent par des **routes API serveur** avec la `service_role`, jamais le client.

---

## 5. Variables d'environnement (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # serveur uniquement
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_CONNECT_CLIENT_ID=
RESEND_API_KEY=
SENTRY_DSN=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_APP_URL=
```

---

## SPRINT 0 — Fondations

- [x] Initialiser Next.js 14 (App Router, TypeScript, ESLint, Tailwind)
- [x] Créer le projet Supabase ; appliquer `0001_init.sql` ; **activer RLS partout**
- [x] Générer les types DB (`supabase gen types typescript`) → `lib/types.db.ts`
- [x] Créer `lib/supabase/{client,server,admin}.ts` + `lib/env.ts` (validation Zod)
- [ ] Brancher le repo sur **Render** (Web Service) ; build OK ; variables d'env en place
- [x] Installer Sentry + PostHog ; vérifier la remontée d'un event de test
- [x] Layout global, design tokens (couleurs LinkedIn : `--accent #0A66C2`), header/footer

**Définition de terminé :** l'app se déploie sur Render, se connecte à Supabase, page d'accueil vide visible en prod.

---

## SPRINT 1 — Auth & profils builders

- [x] Auth Supabase : email/mot de passe + OAuth Google ; `middleware.ts` refresh session
- [x] À l'inscription : création auto d'une ligne `profiles` (trigger ou route)
- [x] Onboarding : choix du `username` (unique), `display_name`, `headline`, avatar
- [x] Page profil public `/u/[username]` (SSR, indexable)
- [x] Édition de profil dans `/dashboard`
- [x] Protéger les routes privées (`/dashboard/**`)

**Définition de terminé :** un utilisateur s'inscrit, complète son profil et le voit en public.

---

## SPRINT 2 — Dépôt prompt/agent/workflow + environnement + versioning

- [x] Formulaire `/dashboard/new` : titre, type, catégorie, description, modèles, tags, prix
- [x] Bloc « Environnement » : champs **clés API requises, variables, dépendances, temps de setup**
- [x] Upload du **bundle** (`.zip` : `prompt.md`/`agent.json`, `.env.example`, guide) → Supabase Storage
- [x] Création d'une `listing` + première `listing_version` (semver `v1.0`)
- [x] Génération du `slug` unique ; statut initial `draft`
- [x] « Publier » → passe en `under_review` (cf. Sprint 8 pour la validation)
- [x] Édition = création d'une **nouvelle version** + changelog (jamais d'écrasement)
- [x] ⚠️ Validation stricte : interdire que le `.env` uploadé contienne des **clés réelles** (regex de détection + refus)

**Définition de terminé :** un builder dépose un agent complet avec son environnement, et le retrouve en brouillon.

---

## SPRINT 3 — Découverte : accueil, catégories, recherche

- [x] Accueil : grande barre de recherche (loupe) + grille de catégories cliquables
- [x] Page `/explore` : grille de résultats + filtres **Type** / **Prix** / **Catégorie**
- [x] Recherche par mots-clés via `tsvector` (trigger qui maintient `search_vector`)
- [x] Fiche `/listing/[slug]` en SSR : description, aperçu **tronqué si payant**, panneau Environnement, avis, similaires
- [x] `sitemap.xml` + `robots.txt` dynamiques ; métadonnées OpenGraph par listing
- [x] Tri (récent, populaire, mieux noté) ; pagination

**Définition de terminé :** on cherche « cold email », on filtre, on ouvre une fiche complète indexable Google.

---

## SPRINT 4 — Marketplace & paiements (Stripe Connect)

- [x] Onboarding **Stripe Connect Express** depuis `/dashboard/payouts` → ligne `stripe_accounts`
- [x] Checkout : route `api/stripe/checkout` (PaymentIntent avec `application_fee_amount` = commission 20 %)
- [x] Webhook `api/webhooks/stripe` : sur `payment_intent.succeeded` → créer `purchase` + `download`
- [x] Empêcher l'achat d'un listing dont le créateur n'a pas `charges_enabled`
- [x] Gérer les remboursements / litiges (statut `purchase`)
- [x] Page builder « Revenus » : ventes, commissions, payouts
- [ ] ⚠️ Vérifier KYC créateur, TVA (Stripe Tax), reçus par email (Resend)

**Définition de terminé :** un acheteur paie un prompt, le builder voit la vente et sa part nette.

---

## SPRINT 5 — Téléchargement & bundle

- [x] Route `api/download/[versionId]` : vérifie `purchase` OU prix = 0, génère une **URL signée** Storage
- [x] Enregistrer chaque téléchargement dans `downloads` (compteurs)
- [x] Écran post-achat : contenu du bundle + bouton de téléchargement `.zip`
- [x] Débloquer le `prompt_body` complet uniquement après achat (rendu côté serveur)

**Définition de terminé :** après paiement, l'utilisateur télécharge le bundle complet et voit le prompt entier.

---

## SPRINT 6 — Réseau léger (follow, avis, badges, réputation)

- [x] Bouton **Suivre** un builder (`follows`) ; compteur d'abonnés
- [x] Avis : note + commentaire, **autorisé seulement si achat/téléchargement** vérifié
- [x] Note moyenne agrégée par listing et par builder (vue SQL ou champ recalculé)
- [ ] Badges automatiques : « Builder vérifié », « Top 1% [catégorie] », paliers de téléchargements
- [x] Stats publiques sur `/u/[username]` : téléchargements, note, prompts, abonnés
- [ ] Bouton **« Ajouter ma certification sur LinkedIn »** (lien de partage pré-rempli)

**Définition de terminé :** un builder a une vraie réputation publique exportable sur LinkedIn.

---

## SPRINT 7 — Hybride : exécution via partenaires

- [x] Table `partner_integrations` + admin pour gérer les partenaires
- [x] Sur une fiche : bouton **« Exécuter dans [outil] »** construit depuis `run_url_template`
- [x] Ajout des paramètres d'**affiliation/referral** dans l'URL sortante
- [ ] Tracking des clics sortants (PostHog) pour mesurer le revshare
- [ ] (Optionnel V1.1) Exécution sandboxée d'agents simples — **à isoler totalement**, voir Sprint 8

**Définition de terminé :** un prompt « Optimisé pour X » propose un bouton d'ouverture chez X avec referral.

---

## SPRINT 8 — Sécurité & modération ⚠️

- [ ] File de validation `under_review` → un admin approuve/refuse avant `published`
- [x] Scan automatique des bundles déposés : détection de **clés/secrets**, de code suspect, de liens d'exfiltration
- [x] Bouton « Signaler » → `moderation_flags` + back-office de traitement
- [ ] Filtres de contenu : jailbreaks, NSFW, désinformation, illégal
- [x] Anti-fraude : avis vérifiés uniquement, anti-bot sur compteurs de téléchargement
- [ ] CGU / CGV / politique de contenu / propriété intellectuelle ; process de takedown
- [ ] Rate limiting sur les routes API sensibles

**Définition de terminé :** rien n'est publié sans validation ; un contenu dangereux peut être bloqué et retiré.

---

## SPRINT 9 — SEO, analytics & monitoring

- [ ] Pages listing en ISR ; balises canoniques ; données structurées (Product/Review)
- [ ] Pages catégories indexables (`/c/[slug]`) — fort levier SEO
- [ ] Dashboard builder : funnel vues → téléchargements → revenus (PostHog)
- [ ] Alertes Sentry + Render (erreurs, latence) ; logs structurés
- [ ] Performance : Core Web Vitals, lazy-loading des images

**Définition de terminé :** chaque prompt est une landing SEO, et tu mesures conversion et erreurs en continu.

---

## SPRINT 10 — B2B / Teams (post-V1)

- [ ] Notion d'**organisation** : membres, rôles (admin/éditeur/lecteur)
- [ ] Bibliothèque **privée** d'entreprise (prompts/agents internes, RLS par org)
- [ ] Espaces par département (RH, SAV, Sales…)
- [ ] Validation interne + versioning des prompts d'équipe
- [ ] SSO Google/Microsoft (puis SAML/SCIM pour le plan Scale)
- [ ] Facturation par siège (Stripe Subscriptions) : 49 / 99 / 299 €/mois
- [ ] Audit log & gouvernance IA

**Définition de terminé :** une entreprise gère ses prompts en privé, par équipe, avec SSO et facturation par siège.

---

## SPRINT 11 — Déploiement & lancement

- [ ] Render : domaine custom, HTTPS, variables de prod, cron jobs (payouts, ré-indexation)
- [ ] Stripe en mode **live** + webhooks de prod
- [ ] Sauvegardes Supabase (Point-in-Time Recovery) vérifiées
- [ ] Amorçage : pré-remplir 100–200 prompts/agents de qualité (anti cold-start)
- [ ] Pages légales en ligne ; emails transactionnels testés
- [ ] Checklist d'accessibilité ; tests end-to-end du parcours achat
- [ ] Go live

---

## Checklist sécurité — à garder sous les yeux en permanence

- [ ] **Jamais** stocker de clés API d'outils tiers en clair. Les builders renseignent `.env.example`, pas de vraies clés.
- [ ] Scanner chaque bundle (secrets, code malveillant) **avant** publication.
- [ ] `service_role` Supabase = serveur uniquement, jamais exposée au client.
- [ ] RLS active sur **toutes** les tables ; tester les accès croisés entre comptes.
- [ ] Contenu payant : tronquer le `prompt_body` côté **serveur**, jamais juste masqué en CSS.
- [ ] Webhooks Stripe : vérifier la signature systématiquement.
- [ ] Exécution d'agents (hybride) : sandbox isolée, pas d'accès au réseau interne, timeouts.
- [ ] RGPD : registre des traitements, suppression de compte, export de données.
- [ ] Anti-piratage : un prompt = du texte facilement copiable → la valeur est dans le **bundle + maintenance + versioning + support**, pas le texte seul.

---

*Fin du plan. Avance sprint par sprint, coche au fur et à mesure.*
