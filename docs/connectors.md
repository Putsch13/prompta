# Connecteurs exécutables — Architecture Prompta

## Décision (2026) — Composio comme backend principal

| Option | Statut |
|--------|--------|
| **Composio** | **Retenu** — 800+ toolkits, OAuth géré, exécution unifiée |
| Maison (5 connecteurs) | Fallback si `COMPOSIO_API_KEY` absente |

## Flux utilisateur

1. Builder ajoute une étape **Action Composio** (toolkit → tool)
2. Utilisateur s'abonne → `ConnectionsMasque` liste les toolkits requis
3. Utilisateur clique **Se connecter** → OAuth Composio (hosted)
4. Run → `composio.tools.execute(toolSlug, { userId, arguments })`

## Variables d'environnement

```env
COMPOSIO_API_KEY=          # Clé plateforme Prompta (composio.dev)
NEXT_PUBLIC_APP_URL=       # Redirect OAuth callback
ENCRYPTION_KEY=            # Chiffrement tokens natifs (fallback)

# Fallback natif (optionnel, sans Composio) :
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
```

## Qu'est-ce qu'un tool call ?

| Action | Compte comme tool call Composio ? |
|--------|-----------------------------------|
| OAuth « Se connecter » | Non |
| 1 étape Action agent (ex. NOTION_CREATE_PAGE) | **Oui = 1 call** |
| Étape LLM | Non (clé utilisateur) |

Facturation Composio : par **tool call exécuté**, pas par connexion.
Plans : gratuit 20k/mois, $29 → 200k/mois.

## Fichiers clés

- `lib/composio/` — client, catalogue, exécution, connexion
- `lib/connectors/execute.ts` — route Composio ou natif
- `GET /api/composio/toolkits` — catalogue builder
- `GET /api/composio/tools?toolkit=` — actions d'un toolkit
- Migration `0024_composio_connections.sql`

## Limitations

LinkedIn post, WhatsApp Business, Instagram : restrictions API des éditeurs même via Composio.
