# TODO Cursor v4 — Prompta (catalogues techniques, B2B landing, durcissement)

> **Mode d'emploi.** Place ce fichier à la racine du repo. Traite les blocs **dans
> l'ordre**. Pour chaque bloc : *« Lis TODO-CURSOR-v4.md, implémente le Bloc N, coche les
> tâches faites, ne touche pas aux autres blocs. »*
> Après chaque bloc : `npx tsc --noEmit` et `npm run lint` doivent passer.
> Constats : `AUDIT-v3.md`. La TODO v3 (sécurité, agents, clés) est déjà appliquée.

**Conventions :** tokens `tailwind.config.ts`, polices `font-display/body/mono`,
primitives `components/ui.tsx`. Migrations SQL à continuer à partir de `0020`.
Écritures sensibles → routes serveur `service_role`. RLS partout.

---

## 🔵 BLOC 1 — Catalogues techniques pour les builders (chantier principal)

> Objectif : remplacer les saisies en texte libre par **trois catalogues structurés**,
> avec l'UX « 3-4 éléments visibles + déroulant recherchable ». Ces métadonnées servent
> la fiche, les filtres et le masque de run.

### 1.1 Définir les catalogues — `lib/catalogs.ts`
- [x] **Modèles IA** — liste groupée par fournisseur, chaque entrée
  `{ id, label, provider, popular: boolean }` :
  - OpenAI : GPT-4o, GPT-4o mini, GPT-4.1, o1, o3-mini
  - Anthropic : Claude Opus, Claude Sonnet, Claude Haiku
  - Google : Gemini 2.5 Pro, Gemini 2.0 Flash
  - Mistral : Mistral Large, Mistral Small
  - Meta : Llama 3.3 · DeepSeek : V3, R1 · xAI : Grok
- [x] **Tech / runtime** — `{ id, label, popular }` :
  Node.js 18+, Node.js 20+, Python 3.10+, Python 3.11+, Deno, Bun, Docker, TypeScript,
  et une entrée « Aucun runtime requis » (prompt pur).
- [x] **Intégrations / connecteurs** — `{ id, label, category, popular }`, groupées :
  - Productivité : Notion, Google Sheets, Google Docs, Google Drive, Airtable, Microsoft 365
  - Design : Canva, Figma, Adobe Express
  - Communication : Slack, Discord, Gmail, MS Teams
  - CRM / Sales : HubSpot, Salesforce, Pipedrive
  - Dev : GitHub, GitLab, Linear, Jira
  - Automatisation : Zapier, Make, n8n
  - Web / e-commerce : Shopify, WordPress, Webflow
  - Réseaux : LinkedIn, X, Instagram, YouTube
- [x] Marquer `popular: true` sur 4-6 entrées par catalogue (les plus utilisées).

### 1.2 Composant `components/builder/CatalogMultiSelect.tsx`
- [x] Affiche d'abord les entrées `popular` sous forme de **chips cliquables** (4-6 max).
- [x] Un bouton **« + Voir tout »** ouvre un **panneau déroulant recherchable**, groupé
  par fournisseur/catégorie, avec un champ de recherche en haut.
- [x] Les entrées sélectionnées s'affichent en **chips retirables** (croix).
- [x] Props : `catalog`, `selected`, `onChange`, `label`, `groupBy?`.
- [x] Réutilisable pour les 3 catalogues.

### 1.3 Intégrer au `CreateWizard`
- [x] Étape « Bases » : remplacer le `models` en dur par
  `CatalogMultiSelect` (catalogue Modèles IA) → « Modèles IA compatibles ».
- [x] Étape « Environnement » : ajouter deux `CatalogMultiSelect` —
  « Runtime / tech requise » (catalogue Tech) et « Intégrations connectées » (catalogue
  Intégrations).
- [x] Ces sélections alimentent : `models` (existant), et les nouveaux champs
  `tech_stack` et `integrations`.
- [x] Quand une intégration nécessite une clé (ex. Serper, Canva), l'ajouter
  automatiquement aux `secrets` du manifeste.

### 1.4 Stockage — migration `0020_listing_tech_metadata.sql`
- [x] Ajouter sur `listings` : `tech_stack text[] default '{}'`,
  `integrations text[] default '{}'`.
- [x] Adapter `app/api/listings/create` et `update` pour persister ces champs.

### 1.5 Affichage côté acheteur
- [x] Fiche listing (`app/listing/[slug]/page.tsx`) : bloc « Compatibilité & prérequis »
  avec des **badges** — modèles IA, runtime, intégrations. Réutiliser les primitives
  `ui.tsx`.
- [x] `app/explore/page.tsx` : ajouter des **filtres** par modèle / intégration.
- [x] `RunPanel` : le bloc « Connexions requises » liste aussi les intégrations
  déclarées qui nécessitent une connexion.
- **DoD :** un builder déclare proprement « cet agent tourne sur GPT-4o + Claude, runtime
  Node 20+, connecté à Canva et Notion » via des catalogues ; l'acheteur voit ces badges,
  peut filtrer dessus, et le masque de run lui demande les bonnes connexions.

---

## 🔵 BLOC 2 — Offre B2B sur la landing (teaser derrière un flag)

> L'offre B2B doit apparaître sur la landing, mais rester **cachée tant que le B2B n'est
> pas développé**. On construit la section, on la pilote par un flag.

- [x] `lib/flags.ts` : flag `B2B_LANDING_MODE` lu depuis `process.env.NEXT_PUBLIC_B2B_
  LANDING_MODE` — valeurs `hidden | teaser | full`, défaut `hidden`.
- [x] `components/marketing/B2BSection.tsx` : section landing « Prompta for Teams » —
  bibliothèque privée d'agents, gouvernance, par équipe. Design aux tokens du site.
  - mode `teaser` : titre + pitch court + badge « Bientôt » + bouton « Être prévenu »
    (capture d'email) ; pas de page de pricing.
  - mode `full` : pitch complet + lien vers `/teams`.
- [x] Intégrer la section dans `app/(marketing)/page.tsx`, rendue selon le flag
  (`hidden` → rien).
- [x] Variable d'env documentée dans `.env.example` : `NEXT_PUBLIC_B2B_LANDING_MODE=
  hidden`.
- **DoD :** la section B2B est codée et prête ; invisible par défaut ; il suffit de
  passer le flag à `teaser` puis `full` pour la révéler, sans toucher au code.

---

## 🟢 BLOC 3 — Durcissement & clarté (vérifications de l'audit)

### 3.1 Run d'agent : mode async pour les agents longs
- [x] `RunPanel.handleAgentRun` : ne plus forcer `async: false`. Utiliser `shouldRunSync`
  (déjà dans `lib/builder/manifest.ts`) — sync si court, sinon `async: true`.
- [x] En mode async : afficher « Agent en file d'attente » + **poller**
  `/api/run/agent/[runId]` pour rafficher la progression et le résultat final.
- **DoD :** un agent long ne fait plus échouer la requête par timeout.

### 3.2 Panneau Stripe builder dans le dashboard
- [x] `app/dashboard/page.tsx` : bandeau clair en haut — « Compte Stripe : ✅ connecté »
  ou « ⚠️ à compléter » + bouton d'onboarding Connect.
- [x] Texte d'explication : le builder ne crée pas de « produit Stripe » — il connecte
  son compte une fois, fixe un prix, la commission de 20 % est prélevée automatiquement.
- [x] Afficher `CommissionNote` aussi à côté du prix dans le `CreateWizard` (étape
  Tarification) si ce n'est pas déjà fait.
- **DoD :** un builder comprend en un coup d'œil l'état de son compte et comment il est
  payé.

### 3.3 Vérification du parcours bout-en-bout
- [x] Tester (et documenter dans `docs/`) : connecter une clé réelle → lancer un prompt →
  créer un agent à 2 étapes → le lancer → voir la sortie.
- [x] Confirmer que le worker tourne sur Render (service séparé) pour les runs async.
- [x] Confirmer en base : migration `0019` appliquée, un seul `is_admin = true`.
- **DoD :** le parcours « j'ai une clé → je lance prompt et agent » fonctionne sur l'app
  déployée.

---

## Ordre & priorités

| Priorité | Bloc | Pourquoi |
|---|---|---|
| 🔵 Principal | 1 | Catalogues techniques — le manque produit le plus visible côté builder. |
| 🔵 Important | 2 | B2B landing — rapide, prépare la suite. |
| 🟢 Finition | 3 | Durcissement et clarté — vérifie que tout tient en réel. |

*Avance bloc par bloc, coche au fur et à mesure, garde `tsc` et `lint` au vert.*
