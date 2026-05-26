# Setup Composio + test Notion E2E

## Quelle clé mettre où ?

Composio affiche **deux types de clés** :

| Clé dans Composio | Où la mettre | Usage |
|-------------------|--------------|-------|
| **Project API Key** (ou API Key) | `.env.local` → `COMPOSIO_API_KEY` | **Celle-ci pour Prompta** — SDK, tool calls, OAuth |
| **Organization token** | **Nulle part pour l'instant** | Admin org multi-projets — pas utilisé par notre code |

```env
COMPOSIO_API_KEY=...   # Project API Key uniquement
```

Où la trouver : [platform.composio.dev](https://platform.composio.dev) → ton **Project** → **Settings** / **API Keys**.

---

## Redirect URL — pas besoin de la chercher dans le dashboard

Composio **n'a pas** (ou rarement) un champ global « Redirect URLs » à remplir à la main.

Le callback est passé **dans le code** à chaque connexion :

```
http://localhost:3000/api/connectors/composio/callback?toolkit=notion
```

Prompta le fait automatiquement quand l'utilisateur clique « Connecter ».  
En prod, c'est la même URL avec ton domaine (`https://prompta.fr/api/connectors/...`).

Si après OAuth tu restes sur une page Composio : retourne manuellement sur `/dashboard/connexions` — la sync se fait au chargement.

---

## Étape 1 — Compte Composio

1. [composio.dev](https://composio.dev) → inscription
2. Copie la **Project API Key** (pas l'org token)

## Étape 2 — `.env.local`

```env
COMPOSIO_API_KEY=ta_project_api_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
ENCRYPTION_KEY=...
```

```bash
npm run dev
```

## Étape 3 — Migration Supabase 0024

SQL Editor → exécute `supabase/migrations/0024_composio_connections.sql`

## Étape 4 — Vérifier l'API

```bash
curl -s http://localhost:3000/api/composio/toolkits | head -c 300
```

Attendu : `"enabled":true`

---

## À partir de l'étape 5

### Étape 5 — Connecter Notion

1. Login Prompta
2. Va sur `/dashboard/connexions`
3. Clique **Connecter** sur Notion
4. Autorise sur la page Composio/Notion
5. Tu reviens sur Prompta (ou va manuellement sur `/dashboard/connexions`)
6. Notion doit afficher **OK**

### Étape 6 — Créer l'agent test

1. `/dashboard/new` → type **Agent**
2. **+ Étape LLM** (ex. GPT-5.4) — prompt qui prépare le contenu
3. **Action Composio** → toolkit **notion** → action (ex. créer une page)
4. Remplis les paramètres avec `{{variable}}` ou `{{step_0_output}}`
5. Onglet **Environnement** : coche Notion si besoin
6. **Test** (playground) → vérifie le résultat
7. **Publie**

Prérequis test : clé OpenAI (ou autre LLM) dans `/dashboard/connexions`.

### Étape 7 — Test utilisateur final

1. Ouvre la fiche listing (URL publique)
2. Connecte Notion si le masque le demande
3. Lance l'agent
4. **Si statut `pending`** → ouvre un 2e terminal :

```bash
npm run worker
```

### Étape 8 — Prod Render

Voir `docs/RENDER-SETUP.md` : Web Service + **Background Worker** + `COMPOSIO_API_KEY`.

---

## Dépannage

| Problème | Solution |
|----------|----------|
| 401 / clé invalide | Utilise la **Project API Key**, pas l'org token |
| Pas de redirect URL dans Composio | Normal — géré par le code Prompta |
| OAuth OK mais pas « connecté » sur Prompta | Recharge `/dashboard/connexions` |
| Run `pending` | `npm run worker` |
| Action Composio invisible | Redémarre `npm run dev` après `.env.local` |
