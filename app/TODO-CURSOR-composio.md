# TODO Composio — Intégration plateforme

> **Recommandation :** utiliser Composio comme backend unique des connecteurs marketplace.
> Les 5 connecteurs natifs restent en fallback si `COMPOSIO_API_KEY` est absent.

## Phase 0 — Setup fondateur (manuel)

- [ ] Créer un compte sur [composio.dev](https://composio.dev) (gratuit : 20k tool calls/mois)
- [ ] Copier `COMPOSIO_API_KEY` dans `.env.local`
- [ ] Vérifier `NEXT_PUBLIC_APP_URL` et `ENCRYPTION_KEY`
- [ ] Appliquer migration `0024_composio_connections.sql`
- [ ] (Prod) Créer auth configs Composio avec vos propres OAuth apps pour white-label

## Phase 1 — Backend (implémenté)

- [x] `lib/composio/client.ts` — client SDK singleton
- [x] `lib/composio/catalog.ts` — sync toolkits + tools (cache 15 min)
- [x] `lib/composio/execute.ts` — `tools.execute()` avec userId Prompta
- [x] `lib/composio/connect.ts` — `toolkits.authorize()` + callback
- [x] `lib/connectors/execute.ts` — route Composio si clé présente
- [x] `GET /api/composio/toolkits` — catalogue builder
- [x] `GET /api/composio/tools?toolkit=` — actions disponibles
- [x] Routes connect/callback — Composio prioritaire
- [x] Migration `composio_account_id` sur `user_connections`
- [x] Pricing : `COMPOSIO_TOOL_CALL_CENTS` dans `lib/llm/pricing.ts`

## Phase 2 — UI (implémenté)

- [x] `ComposioActionPicker` dans StepEditor (toolkit → action)
- [x] CreateWizard : intégrations depuis API Composio
- [x] `/dashboard/connexions` : section connecteurs OAuth Composio
- [x] `ConnectionsMasque` : support toolkits Composio
- [x] `.env.example` + `docs/connectors.md` mis à jour

## Phase 3 — QA & prod

- [ ] Tester : builder ajoute étape Notion → user connecte → run OK
- [ ] Tester : agent legacy (gmail.send natif) en fallback sans Composio
- [ ] Monitorer volume tool calls dashboard Composio
- [ ] Refacturer via crédits v6 (marge sur `COMPOSIO_TOOL_CALL_CENTS`)
- [ ] (Optionnel) White-label OAuth Composio en prod

## Phase 4 — Évolution

- [ ] Triggers Composio (webhooks entrée) — remplace TODO connecteurs C6
- [ ] Cache Redis toolkits si >850 apps ralentissent le builder
- [ ] Composio Tool Router pour agents entièrement agentiques

---

## Qu'est-ce qu'un « tool call » ?

Un **tool call Composio** = **1 exécution d'action** sur un service externe via leur API.

| Événement | Tool call ? |
|-----------|-------------|
| Utilisateur clique « Connecter Notion » (OAuth) | **Non** |
| Agent exécute `NOTION_CREATE_PAGE` | **Oui** = 1 call |
| Agent enchaîne Gmail + Slack + Notion | **3 calls** |
| Étape LLM (OpenAI/Claude) | **Non** (facturé via clé LLM utilisateur) |
| Recherche web Serper | **Non** (hors Composio) |

## Estimation coûts Prompta (ordre de grandeur)

Hypothèses : 500 utilisateurs actifs, 10 runs/mois/user, 2 actions Composio/run en moyenne.

| Poste | Calcul | ~€/mois |
|-------|--------|---------|
| **Composio** | 10 000 calls → plan $29 | **~27 €** |
| **Vercel/hosting** | Pro ou équivalent | **20–50 €** |
| **Supabase** | Pro si >500 Mo | **25 €** |
| **LLM (plateforme)** | Si vous payez des runs admin | variable |
| **Stripe** | 1,5 % + 0,25 € / transaction | % CA |
| **Resend email** | Faible volume | **0–10 €** |
| **Sentry/PostHog** | Free tiers | **0–20 €** |

**Total infra MVP** (sans LLM utilisateur) : **~70–130 €/mois**

À 5 000 users × 10 runs × 2 actions = 100k calls → toujours dans le plan $29.
À 50k users avec même intensité → ~2M calls → plan $229 (~210 €).

**Règle :** refacturer les tool calls Composio dans vos crédits (marge 1.6× déjà en v6).
