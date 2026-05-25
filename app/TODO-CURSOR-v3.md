# TODO Cursor v3 — Correctifs Prompta (sur le code uploadé le 25/05)

> **Mode d'emploi.** Place ce fichier à la racine du repo. Traite les blocs **dans
> l'ordre**. Pour chaque bloc : *« Lis TODO-CURSOR-v3.md, implémente le Bloc N, coche les
> tâches faites, ne touche pas aux autres blocs. »*
> Après chaque bloc : `npx tsc --noEmit` et `npm run lint` doivent passer.
> Référence des constats : `AUDIT-v2.md`.

**Conventions :** tokens `tailwind.config.ts` (`bg/card/line/ink/accent…`), polices
`font-display/body/mono`, primitives `components/ui.tsx`. Migrations SQL à continuer à
partir de `0019`. Écritures sensibles → routes serveur `service_role`. RLS partout.

---

## 🔴 BLOC 1 — Colmater la faille d'escalade de privilège admin

> Aujourd'hui n'importe quel utilisateur peut se mettre `is_admin = true` via la RLS
> `UPDATE` de `profiles`. À corriger avant tout.

- [x] Migration `0019_protect_is_admin.sql` : créer un trigger `BEFORE UPDATE` sur
  `profiles` qui **rejette toute modification de `is_admin`** sauf si l'appel vient du
  `service_role`. Implémentation : fonction `security definer` comparant
  `OLD.is_admin` / `NEW.is_admin` et levant une exception si elles diffèrent et que
  `current_setting('request.jwt.claims', true)` n'indique pas le rôle service.
- [x] Vérifier en base : une seule ligne `profiles` a `is_admin = true` (la tienne).
- [x] Ajouter un test manuel documenté : depuis un compte non-admin, tenter
  `update profiles set is_admin = true` → doit échouer.
- **DoD :** impossible de devenir admin autrement que par une écriture `service_role`.

---

## 🔴 BLOC 2 — Rendre les agents réellement créables (éditeur de manifeste)

- [x] `components/builder/StepEditor.tsx` : éditeur d'étapes
- [x] Modifier `CreateWizard.tsx` — étape « Contenu »
- [x] À la soumission, construire le manifeste conforme au schéma Zod
- [x] Adapter `app/api/listings/create/route.ts` et `update/route.ts`
- [x] Migration `0020` si besoin — réutilise `env` avec `{ manifest, meta }`
- **DoD :** un builder crée un agent à 2+ étapes ; manifeste valide en base

---

## 🔴 BLOC 3 — Faire tourner les agents (worker + mode synchrone)

- [x] Mode synchrone par défaut si `steps.length <= 3` sans outil long
- [x] Worker documenté (`npm run worker`) + README Render Background Worker
- [x] Cron tick traite runs `pending` (filet de sécurité)
- [x] Dashboard runs : statuts + horodatage + réessayer
- [x] Restitution d'échec avec `error_message` + action contextuelle
- [x] Plafonds `max_steps`, `max_tokens`, `timeout_ms` dans orchestrator
- **DoD :** agent exécutable sync/async, statuts visibles

---

## 🟠 BLOC 4 — Réparer la sauvegarde des clés API

- [x] `UserSetupWizard` : étape 3 seulement si toutes clés enregistrées
- [x] `app/api/keys/route.ts` : sauvegarde même si test échoue, retour `{ key, valid }`
- [x] Connexions : refresh + toast confirmation
- [x] Rotation : wizard pré-rempli sur le bon provider
- **DoD :** clé saisie visible au retour, jamais perdue

---

## 🟠 BLOC 5 — Garde-fou Stripe & disclaimer pour la vente

- [x] Disclaimer + KYC live dans CreateWizard
- [x] Refus publication payante sans Stripe (create/update)
- [x] Helper `canSellPaid(userId)` dans `lib/platform-access.ts`
- **DoD :** impossible de publier payant sans Stripe validé

---

## 🟠 BLOC 6 — Rappel des commissions builder partout

- [x] `PLATFORM_COMMISSION_PERCENT` source de vérité
- [x] `components/CommissionNote.tsx`
- [x] Affiché dans CreateWizard (tarification)
- **DoD :** commission rappelée à la fixation de prix

---

## 🟠 BLOC 7 — Dashboard builder « vision finale »

- [x] Bandeau état Stripe
- [x] Cartes revenus (ventes, MRR, commissions)
- [x] Stats par listing enrichies
- [x] Bloc runs récents
- [x] Alertes (échecs, clés, revue)
- [x] Actions rapides par listing
- [x] `BuilderOnboardingChecklist`
- **DoD :** vision builder en un coup d'œil

---

## 🟠 BLOC 8 — Section « Environnement » du wizard avec ajout manuel

- [x] Ajout manuel variables + clés API requises
- [x] Auto-détection éditable/supprimable
- [x] Corbeille par entrée
- **DoD :** environnement composable librement

---

## 🟡 BLOC 9 — Clarifier les formules de monétisation

- [x] Hiérarchie : abo+BYOK défaut, crédits discrets
- [x] UI fiche : SubscribeButton primaire, crédits en option
- [x] `RUN_CREDIT_COST_CENTS` documenté dans `docs/MONETISATION.md`
- [x] Anti double-facturation dans `/api/run/prompt`
- [x] Doc grille tarifaire `docs/MONETISATION.md`
- **DoD :** pas de double facturation, modèles clarifiés

---

## 🟡 BLOC 10 — Playground builder réel & nettoyage de dette

- [x] Étape Test : vrai lancement via `/api/run/agent` preview
- [x] Clarification `lib/agent/` vs `lib/agents/` (README)
- [x] Ternaire mort corrigé dans `update/route.ts`
- [x] Commentaire streaming simulé V1 dans `gateway.ts`
- **DoD :** builder teste avant publication

---

## 🟡 BLOC 11 — Observabilité & robustesse

- [x] Tableau santé runtime dans `/admin`
- [x] Estimation coût avant run dans `RunPanel`
- [x] Versioning visible sur fiche listing (déjà présent)
- [x] Reçus achat + confirmation abonnement (webhook + email)
- [x] Éval cron : retrait badge vérifié si agent échoue
- **DoD :** détection proactive des agents cassés
