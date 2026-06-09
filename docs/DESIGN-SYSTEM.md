# Prompta — Design System

> Système de design unifié pour le parcours **Construire → Connecter → Lancer → Débugger**.
> Promesse produit : « comme Render, mais pour les agents IA ».

Ce document fige les tokens, primitives et conventions. Toute nouvelle UI doit
réutiliser ces tokens/primitives plutôt que des classes ad hoc.

## 1. Tokens de couleur (`tailwind.config.ts`)

| Token | Hex | Usage |
|-------|-----|-------|
| `bg` | `#F8F8F6` | Fond global de page |
| `card` | `#FFFFFF` | Surfaces (cartes, panneaux) |
| `card2` | `#F3F3F1` | Surfaces secondaires / hover |
| `line` | `#E5E5E3` | Bordures, séparateurs |
| `line-soft` | `#EDEDEB` | Séparateurs discrets |
| `ink` | `#1A1A1A` | Texte principal |
| `ink-soft` | `#6B6B6B` | Texte secondaire |
| `ink-faint` | `#A3A3A3` | Texte tertiaire / métadonnées |
| `accent` | `#0A66C2` | Action primaire, liens, états actifs |
| `accent.hover` | `#004182` | Survol de l'accent |
| `accent.light` | `#E8F4FF` | Fonds accentués légers |
| `success` | `#059669` | Succès |
| `warning` | `#D97706` | Avertissement / validation requise |
| `destructive` | `#DC2626` | Erreur / action destructive |

**Règle :** n'utilisez jamais une couleur en dur (`#...`) dans un composant ;
référez-vous au token. Les statuts colorés passent par `StatusPill` (cf. §3).

## 2. Typographie, rayon, espacement

- Police : `font-display` / `font-sans` (Geist Sans), `font-mono` (Geist Mono) pour logs/code.
- Rayons : `rounded-sm` (4px), `rounded-md` (8px), `rounded-lg` (12px), `rounded-xl`/`rounded-2xl` pour les cartes premium.
- Largeur de page : `max-w-page` (1180px).

## 3. Primitives (`components/ui.tsx`)

Réutilisez ces composants partout ; ne dupliquez pas leurs classes.

- `Button` — bouton primitif (`primary` / `secondary` / `ghost` / `danger`, tailles `sm`/`md`).
- `Card` — surface carte standard (`rounded-xl border border-line bg-card`).
- `TypeBadge` — badge type de contenu (prompt / agent / workflow).
- `PriceTag` — affichage prix / « Gratuit ».
- `Avatar` — avatar avec initiales fallback.
- `BadgePill` — pastille générique (primary/secondary).
- `StatusPill` + `statusTone(status)` — **pastille de statut unifiée** des runs.
  Tonalités : `running`, `success`, `failed`, `pending`, `warning`, `cancelled`, `neutral`.
  ```tsx
  <StatusPill tone={statusTone(run.status)}>{label}</StatusPill>
  ```
- `EmptyState` — état vide cohérent (icône + titre + description + action).
- `Kicker`, `Stars`, `fmt` — accessoires divers.

## 4. Parcours & masques

- **Console de run** : `components/run/AgentRunConsole.tsx` (timeline live, bouton
  « Arrêter », « Copier le rapport »). Statuts colorés, durées, erreurs actionnables.
- **Timeline détaillée** : `components/run/RunStepTimeline.tsx` + page détail
  `app/dashboard/runs/[runId]/page.tsx` (code+message d'erreur par étape, diagnostic
  sans secret).
- **Connexions** : `components/run/ConnectionsMasque.tsx` avec bouton « Tester l'accès »
  (diagnostic réel via `/api/connectors/[id]/diagnose`).
- **Builder guidé** : `components/builder/canvas/GuidedBuilder.tsx` (canvas + copilote,
  base de connaissances RAG, indicateurs de complétude par nœud).

## 5. Sécurité d'affichage

- Aucun secret ne doit apparaître dans `input_preview` / `output_preview` / messages
  d'erreur. La redaction est centralisée dans `lib/agent/step-logger.ts`
  (`redactSecrets`) et appliquée avant insertion en base.

## 6. État des lots P2

Livré :
- Tokens couleur/typo/rayon documentés (§1–2).
- Primitives `Button`, `Card`, `StatusPill`/`statusTone`, `EmptyState` (§3),
  adoptées dans `runs/page` et `LibraryTabs`.
- Landing `app/(marketing)/page.tsx` — section **parcours en 4 temps**
  (Construire / Connecter / Lancer / Débugger).
- Shell dashboard `components/DashboardNav.tsx` — nav latérale desktop +
  **barre horizontale scrollable sur mobile** (viewport ~380px).
- Connexions `app/dashboard/connexions/page.tsx` — catalogue marketplace
  (`ComposioCatalog`) avec recherche, connexion et test d'accès (P0-4).

Améliorations continues possibles (non bloquantes) :
- Généraliser `Button`/`Card` aux écrans restants au fil des évolutions.
- Toast/Drawer/Tabs primitifs si un besoin transverse émerge.

> Avant chaque merge UI : `npx tsc --noEmit && npm run lint && npm run test:unit && npm run build`.
