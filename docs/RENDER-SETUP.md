# Déploiement Render — guide pas à pas

## 1. Web Service (site Next.js)

1. [dashboard.render.com](https://dashboard.render.com) → **New +** → **Web Service**
2. Connecte le repo GitHub `prompta`
3. Paramètres :
   - **Build Command** : `npm install && npm run build`
   - **Start Command** : `npm run start`
   - **Instance type** : Starter (ou Free pour tester)

> Le message `Detected service running on port 10000` est **normal**. Render injecte `PORT=10000` ; Next.js l’utilise automatiquement. Ce n’est pas une erreur.

---

## 2. Variables d'environnement (Environment)

Render → ton service **prompta** → **Environment** → **Add Environment Variable**

Copie **toutes** les variables de `.env.example`. Minimum pour que le site tourne :

| Variable | Où la trouver |
|----------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | idem |
| `SUPABASE_SERVICE_ROLE_KEY` | idem (secret) |
| `NEXT_PUBLIC_APP_URL` | `https://ton-app.onrender.com` ou ton domaine |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard |
| `STRIPE_SECRET_KEY` | Stripe Dashboard |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks |
| `STRIPE_CONNECT_CLIENT_ID` | Stripe Connect |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` (terminal local) |
| `CRON_SECRET` | `openssl rand -hex 32` (autre valeur) |

Optionnel (tu peux ajouter plus tard) :

| Variable | Usage |
|----------|-------|
| `RESEND_API_KEY` | Emails reçus |
| `SENTRY_DSN` | Monitoring erreurs |
| `NEXT_PUBLIC_POSTHOG_KEY` | Analytics |
| `ANTHROPIC_API_KEY` | Agents admin en mode live |
| `PLATFORM_OPENAI_KEY` | Runs sans clé utilisateur |
| `E2B_API_KEY` | Code arbitraire agents |

**Important :** pas de guillemets autour des valeurs sur Render.

---

## 3. Background Worker (agents async)

1. **New +** → **Background Worker**
2. Même repo, branche `main`
3. **Start Command** : `npm run worker`
4. Copie les mêmes variables Supabase + `ENCRYPTION_KEY` + clés plateforme

---

## 4. Cron Jobs

Render → **Cron Jobs** → **New Cron Job** (lié au Web Service ou en standalone curl)

| Nom | Schedule | Commande |
|-----|----------|----------|
| Agents admin | `0 * * * *` | `curl -sS -H "Authorization: Bearer $CRON_SECRET" https://TON-DOMAINE/api/cron/tick` |
| Badges | `0 3 * * *` | `curl -sS -H "x-cron-secret: $CRON_SECRET" -X POST https://TON-DOMAINE/api/cron/badges` |
| Scheduled runs | `*/15 * * * *` | `curl -sS -H "x-cron-secret: $CRON_SECRET" -X POST https://TON-DOMAINE/api/cron/scheduled-runs` |
| Revshare Pro | `0 4 1 * *` | `curl -sS -H "x-cron-secret: $CRON_SECRET" -X POST https://TON-DOMAINE/api/cron/revshare` |

Dans chaque Cron Job → **Environment** → ajoute `CRON_SECRET` avec la **même valeur** que sur le Web Service.

---

## 5. Supabase (avant prod)

1. SQL Editor → exécuter migrations `0001` → `0018` dans l'ordre
2. Te passer admin :
   ```sql
   update profiles set is_admin = true where username = 'TON_USERNAME';
   ```
3. (Optionnel) Personas : en local avec `.env.local` rempli :
   ```bash
   npx tsx scripts/seed-personas.ts
   ```

---

## 6. Stripe webhook prod

Stripe → Developers → Webhooks → Add endpoint

- URL : `https://TON-DOMAINE/api/webhooks/stripe`
- Events : `checkout.session.completed`, `account.updated`, `customer.subscription.*`, `invoice.*`

Copie le signing secret → `STRIPE_WEBHOOK_SECRET` sur Render.

---

## 7. Lire les logs Render

Les lignes comme :
```
clientIP="..." responseTimeMS=20 responseBytes=282
```
sont des **requêtes HTTP normales** (assets, API, prefetch). Ce ne sont pas des erreurs.

Cherche plutôt :
- `error`, `500`, `Invalid environment`
- Crash au démarrage (build failed)
