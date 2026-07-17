# Design system Prompta — DA « AI Core »

*Mis à jour le 16 juillet 2026 — refonte dark HUD. Source de vérité des tokens :
`tailwind.config.ts` (+ utilitaires dans `app/globals.css`).*

## Intention

Interface sombre façon HUD sci-fi : fond quasi-noir bleuté, cyan électrique
lumineux, lignes fines, typographie technique (mono pour les labels/data),
animations discrètes (glow, scan, anneaux rotatifs). L'extension, la web app et
l'admin partagent la même palette.

## Tokens (Tailwind)

| Token | Valeur | Usage |
|---|---|---|
| `bg` | `#05070D` | Fond de page |
| `card` | `#0A0F1B` | Surfaces (cartes, header) |
| `card2` | `#0E1524` | Inserts, inputs, hover |
| `line` | `#172136` | Bordures 1px |
| `line-soft` | `#111A2B` | Bordures discrètes |
| `ink` | `#E4EDF9` | Texte principal |
| `ink-soft` | `#8FA1BC` | Texte secondaire |
| `ink-faint` | `#5B6B85` | Texte tertiaire, placeholders |
| `accent` | `#38BDF8` | Cyan électrique (liens, actifs, glow) |
| `accent-hover` | `#67D0FF` | Hover |
| `accent-light` | `#0B2036` | Fond teinté accent (sombre) |
| `accent-dim` | `#1E7FC2` | Extrémité sombre des gradients |
| `accent-ink` | `#04121F` | **Texte posé SUR un fond accent** |
| `success` / `warning` / `destructive` | `#34D399` / `#FBBF24` / `#F87171` | Statuts |

Fonts : Geist Sans (`font-display`/`font-body`), Geist Mono (`font-mono` —
labels techniques, timestamps, kickers).

## Conventions

- **Bouton primaire** : `bg-accent text-accent-ink font-semibold shadow-glow-sm hover:bg-accent-hover hover:shadow-glow` (jamais `text-white` sur accent).
- **Pastilles de statut** : `border border-<token>/30 bg-<token>/10 text-<token>` — voir `StatusPill` dans `components/ui.tsx`.
- **Kicker de section** : classe `.hud-label` (mono, uppercase, letterspacing 0.18em, cyan).
- **Inputs** : `border-line bg-card2 text-ink placeholder:text-ink-faint focus:border-accent/60 focus:ring-1 focus:ring-accent/40`.

## Utilitaires d'ambiance (`app/globals.css`)

- `.hud-label` — étiquette technique mono/uppercase.
- `.hud-card` — carte sombre, liseré lumineux au hover.
- `.hud-corners` — brackets de viseur aux coins.
- `.bg-hud-grid` — quadrillage fin 44px.
- `.bg-hud-halo` — halo radial cyan en tête de section.
- `.hud-scanline` — bande de balayage (à combiner avec `animate-scan`).

## Animations (tailwind.config.ts)

`animate-glow-pulse` (pulsation du glow), `animate-fade-up` (entrée, à décaler
avec `style={{animationDelay}}`), `animate-ring-spin` / `-slow` / `-rev`
(anneaux rotatifs du hero/logo), `animate-scan` (scanline), `animate-blink`
(dot de statut live). Ombres : `shadow-glow`, `shadow-glow-sm`, `shadow-glow-lg`.
`prefers-reduced-motion` coupe marquee/scan/rings/glow.

## Logo

`components/Logo.tsx` — « P » dans un anneau-viseur avec arc rotatif
(`<Logo size={28} animate={false} />` pour les contextes denses) ;
`LogoWordmark` pour header/footer.

## Extension

`extension/popup.html` (vars CSS) et `extension/content.js` (styles inline,
Shadow DOM) reprennent la même palette — synchronisation manuelle : toute
évolution des tokens doit être reportée dans ces deux fichiers.
