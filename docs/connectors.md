# Connecteurs exécutables — Architecture Prompta

## Décision (Bloc C1)

**Choix : abstraction native + connecteurs maison prioritaires**, avec possibilité d'intégrer **Composio** plus tard comme backend unifié.

| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| **Composio** | 250+ apps, OAuth géré, actions prêtes | Coût par action, dépendance externe |
| **Maison (retenu pour V1)** | Contrôle total, pas de coût tiers | Maintenance par service |

**V1 implémentée :** 5 connecteurs natifs avec actions réelles côté serveur :
- Gmail (OAuth Google)
- Google Sheets (OAuth Google)
- Slack (OAuth)
- Telegram (API key / bot token)
- Canva (OAuth — stub si clé plateforme absente)

WhatsApp Business API : prévu mais non implémenté (approbation Meta requise).

## Modèle de données

```
Connector { id, label, authType, actions[] }
Action { id, label, inputs[], execute(params, connection) }
user_connections { owner_id, connector_id, tokens chiffrés, status }
```

## Flux utilisateur

1. Builder ajoute une étape **Action** → connecteur ajouté aux connexions requises
2. Utilisateur s'abonne → `ConnectionsMasque` liste clés API + OAuth
3. Run → orchestrateur résout la connexion de **l'utilisateur** (jamais celle du builder)

## Variables d'environnement

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
CANVA_CLIENT_ID=
CANVA_CLIENT_SECRET=
COMPOSIO_API_KEY=   # optionnel, phase 2
```

## Évolution Composio (phase 2)

Remplacer `lib/connectors/execute.ts` par un adaptateur Composio qui implémente la même interface `Connector`.
