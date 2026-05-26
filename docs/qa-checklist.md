# Checklist QA manuelle — Prompta

Parcours critique à valider avant chaque release. Cocher chaque point.

## Prérequis

- [ ] Migrations Supabase 0001 → 0024 appliquées
- [ ] `.env.local` renseigné (Supabase, Stripe test, ENCRYPTION_KEY, CRON_SECRET)
- [ ] `npm run dev` + `npm run worker` en parallèle (terminal séparé)
- [ ] Compte builder + compte utilisateur final (navigation privée)

---

## 1. Onboarding clés API (DEBUG-4)

- [ ] Ouvrir le wizard depuis une fiche agent → coller une clé OpenAI valide
- [ ] La clé est marquée « Enregistrée et validée »
- [ ] Modifier la clé après sauvegarde → le wizard la re-enregistre (pas de skip silencieux)
- [ ] Clé invalide → message « enregistrée mais non validée », retour sur Connexions OK
- [ ] `/api/keys` GET → la clé apparaît avec `last4` correct

---

## 2. Run prompt (BYOK)

- [ ] Fiche prompt gratuite → onglet « Lancer ici »
- [ ] Sans clé → wizard s'ouvre
- [ ] Avec clé → streaming affiche la réponse (label « Exécution en cours… »)
- [ ] Erreur fournisseur lisible (clé expirée, modèle inconnu)

---

## 3. Run agent 2 étapes (DEBUG-2) — **priorité absolue**

### Builder
- [ ] Créer un agent à 2 étapes LLM (ex. résumer → reformuler)
- [ ] Variables d'entrée propres (pas de `variable` parasite)
- [ ] Publier / modération OK

### Utilisateur final
- [ ] Acheter ou accès gratuit → fiche agent
- [ ] Connecter clé LLM (BYOK)
- [ ] Remplir variables → « Lancer l'agent »
- [ ] Progression visible (étape 1/2, 2/2)
- [ ] Résultat affiché OU erreur compréhensible
- [ ] `/dashboard/runs` → run listé avec statut final

### Worker async (>3 étapes ou outils)
- [ ] Agent 4+ étapes → statut « En file d'attente » puis exécution
- [ ] Sans worker → reste en file (comportement attendu)
- [ ] Avec worker → complété en < 3 min

---

## 4. Connecteurs Composio (Notion)

- [ ] `COMPOSIO_API_KEY` configurée
- [ ] Utilisateur connecte **son** Notion via OAuth
- [ ] Agent avec action Notion → exécution OK ou erreur claire si non connecté

---

## 5. Paiements

- [ ] Achat prompt → page success + téléchargement bundle
- [ ] Achat agent → page success + CTA « Lancer l'agent » (pas de download)
- [ ] Webhook Stripe → purchase `completed` en base

---

## 6. Modèles (DEBUG-1)

- [ ] Builder : modèles GPT-5.x, Claude 4.x, Gemini 3.x visibles (pas gpt-4o)
- [ ] Run avec `gpt-5.4` → appel API aboutit
- [ ] Run avec `claude-sonnet-4-6` → appel API aboutit (clé Anthropic)
- [ ] Test clé dans wizard utilise les modèles actuels (pas gpt-4o-mini)

---

## 7. Régression rapide

```bash
npx tsc --noEmit
npm run lint
npm run test:e2e
```

- [ ] TypeScript vert
- [ ] Lint vert
- [ ] E2E public vert

---

## Notes / bugs trouvés

| Date | Parcours | Bug | Statut |
|------|----------|-----|--------|
|      |          |     |        |
