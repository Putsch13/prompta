# Setup Composio + test Notion E2E

## Étape 1 — Compte Composio (5 min)

1. Va sur [https://composio.dev](https://composio.dev) → **Sign up** (gratuit, 20k tool calls/mois)
2. Dashboard → **Settings** ou **API Keys** → copie la clé (`sk-...` ou équivalent)
3. Dashboard → **Auth Configs** (optionnel en dev) : Composio crée les configs automatiquement au premier connect

## Étape 2 — `.env.local`

Ajoute ou complète :

```env
COMPOSIO_API_KEY=ta_cle_ici
NEXT_PUBLIC_APP_URL=http://localhost:3000
ENCRYPTION_KEY=...   # déjà requis — openssl rand -hex 32
```

Redémarre le serveur dev :

```bash
npm run dev
```

## Étape 3 — Callback OAuth Composio

Dans le dashboard Composio → **Project Settings** → **Redirect URLs** (ou Auth Callback) :

```
http://localhost:3000/api/connectors/composio/callback
```

En prod, ajoute aussi :

```
https://ton-domaine.fr/api/connectors/composio/callback
```

## Étape 4 — Migration Supabase 0024

SQL Editor Supabase → exécute le fichier :

`supabase/migrations/0024_composio_connections.sql`

(Si 0022/0023 pas encore faits, les appliquer avant.)

## Étape 5 — Vérifier que Composio répond

```bash
curl -s http://localhost:3000/api/composio/toolkits | head -c 500
```

Tu dois voir `"enabled":true` et une liste de toolkits.

## Étape 6 — Connecter Notion (utilisateur test)

1. Login sur Prompta
2. `/dashboard/connexions` → **Notion** → **Connecter**
3. Autorise dans la page Composio/Notion
4. Retour sur Prompta → badge **OK** sur Notion

## Étape 7 — Créer un agent test (builder)

1. `/dashboard/new` → type **Agent**
2. StepEditor → **Action Composio** → toolkit **notion** → choisis une action (ex. créer page)
3. Ajoute une étape LLM avant si besoin (rédiger le contenu)
4. Playground : renseigne les variables
5. Publie

## Étape 8 — Lancer en tant qu'utilisateur final

1. Ouvre la fiche listing publiée
2. Vérifie **ConnectionsMasque** : Notion connecté
3. Lance l'agent
4. Si agent async : `npm run worker` dans un 2e terminal

## Dépannage

| Problème | Solution |
|----------|----------|
| Bouton « Action Composio » absent | `COMPOSIO_API_KEY` manquante ou serveur pas redémarré |
| 503 au connect | Clé Composio invalide |
| OAuth boucle / échec | Redirect URL mal configurée dans Composio |
| Run échoue « connexion requise » | Reconnecter Notion depuis `/dashboard/connexions` |
| Run reste `pending` | Lancer `npm run worker` |
