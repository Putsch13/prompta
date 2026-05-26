# Cas d'usage signature — Assistant Email Pro

Agent démo **SCALE-1** pour freelances, consultants et PME.

## Valeur

- **Problème** : répondre à des emails clients prend du temps et demande le bon ton.
- **Solution** : coller l'email reçu → l'agent analyse puis rédige une réponse pro en 2 étapes LLM.
- **Résultat** : réponse structurée (objet + corps) prête à copier dans Gmail/Outlook.

## Déployer l'agent

```bash
CREATOR_USERNAME=admin npx tsx scripts/seed-signature-agent.ts
```

Puis ouvrir : `/listing/assistant-email-pro`

## Parcours démo prospect (5 min)

1. **Compte utilisateur** (navigation privée) — inscription
2. **Clé OpenAI** — wizard depuis la fiche agent (BYOK)
3. **Coller un email** dans « Email reçu »
4. **Lancer l'agent** — voir progression 1/2 → 2/2
5. **Copier la réponse** — montrer le gain de temps

## Prérequis techniques

```bash
npm run dev          # terminal 1
npm run worker       # terminal 2 (agents async uniquement ; 2 étapes = sync OK)
```

Migrations Supabase à jour (0001 → 0025).

## Extension vente

- Version payante avec abonnement mensuel
- Variante + Gmail (Composio) pour envoi direct — nécessite connexion OAuth utilisateur
- Ciblage SEO : `/c/productivite`, LinkedIn « agent email freelance »

## Validation automatisée

```bash
npm run validate:signature-agent   # manifeste + variables + sync
npm run test:e2e                     # Playwright (skip si agent non seedé)
```

## Builder (SCALE-4)

Les mêmes templates sont disponibles dans **Dashboard → Nouveau** :
- Templates de départ (4 cas d'usage)
- Création assistée par IA (`/api/builder/generate`)
