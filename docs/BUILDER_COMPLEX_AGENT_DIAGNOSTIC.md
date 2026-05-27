# Diagnostic produit — Builder & agents complexes

> Ce document recense 100 scénarios d'agents marketplace complexes, identifie les risques associés, et priorise les corrections à apporter.

---

## 100 scénarios d'agents complexes

### A. Data / recherche / veille (1–10)

| # | Scénario | Risque |
|---|----------|--------|
| 1 | Agent qui lit 20 PDFs, extrait les points clés, produit un rapport | Contexte trop long, mauvais chunking, livrable trop gros |
| 2 | Agent qui compare 5 documents contractuels | Confusion entre documents, citations perdues |
| 3 | Agent qui surveille une URL toutes les semaines | Scheduling absent, retry absent, statut invisible |
| 4 | Agent qui cherche des infos sur le web puis écrit une synthèse | Sources non citées, hallucination, timeout |
| 5 | Agent qui lit une base Notion puis génère une roadmap | Connecteur Notion mal lié au compte user |
| 6 | Agent qui classe automatiquement des documents uploadés | Permissions fichiers, mauvais owner |
| 7 | Agent qui extrait des tableaux de PDFs | OCR/table parsing absent ou fragile |
| 8 | Agent qui résume 100 tickets support | Limite tokens, perte de données |
| 9 | Agent qui fait une veille concurrentielle journalière | Runs récurrents non monitorés |
| 10 | Agent qui produit un benchmark détaillé avec liens | Livrable mal structuré, liens perdus |

### B. CRM / sales (11–20)

| # | Scénario | Risque |
|---|----------|--------|
| 11 | Agent qui enrichit des leads depuis un CSV | Mapping colonnes fragile |
| 12 | Agent qui écrit un email personnalisé pour chaque lead | Boucle mal gérée, rate limit Gmail |
| 13 | Agent qui envoie des emails via Gmail | Mauvais compte Gmail connecté |
| 14 | Agent qui met à jour HubSpot | Action sans paramètre obligatoire |
| 15 | Agent qui crée une tâche CRM après analyse | Idempotence absente, doublons |
| 16 | Agent qui score les leads puis filtre les meilleurs | Étape conditionnelle absente |
| 17 | Agent qui relance uniquement les leads non répondus | Lecture inbox compliquée, permissions |
| 18 | Agent qui synchronise Google Sheets vers CRM | Types invalides, lignes dupliquées |
| 19 | Agent qui génère un script d'appel | Variables client mal résolues |
| 20 | Agent qui crée une séquence email complète | Plusieurs livrables non gérés |

### C. Marketing / contenu (21–30)

| # | Scénario | Risque |
|---|----------|--------|
| 21 | Agent qui transforme un brief en 10 posts LinkedIn | Livrable multi-format absent |
| 22 | Agent qui génère un calendrier éditorial mensuel | Dates mal gérées, timezone |
| 23 | Agent qui adapte un contenu en plusieurs tons | Paramètres user mal validés |
| 24 | Agent qui analyse les performances de posts | Connecteur analytics absent ou mauvais |
| 25 | Agent qui génère images + textes | Livrables mixtes non gérés |
| 26 | Agent qui crée une landing page HTML | Code dangereux ou non validé |
| 27 | Agent qui réécrit une page SEO | Trop de champs, variables manquantes |
| 28 | Agent qui analyse 50 concurrents SEO | Timeout, scraping fragile |
| 29 | Agent qui crée une newsletter | Preview / download absent |
| 30 | Agent qui segmente une audience | Données perso, permissions, RGPD |

### D. E-commerce (31–40)

| # | Scénario | Risque |
|---|----------|--------|
| 31 | Agent qui crée des fiches produits depuis un CSV | Boucle longue, livrable volumineux |
| 32 | Agent qui traduit fiches produits en 5 langues | Explosion du coût crédits |
| 33 | Agent qui optimise titres Amazon | Règles marketplace non encodées |
| 34 | Agent qui répond aux avis clients | Ton inadapté, action auto dangereuse |
| 35 | Agent qui analyse stocks et ventes | Connecteur e-commerce mal authentifié |
| 36 | Agent qui crée des bundles produits | Logique business non validée |
| 37 | Agent qui détecte produits à faible marge | Calculs erronés |
| 38 | Agent qui génère descriptions à partir d'images | Input image pas supporté |
| 39 | Agent qui synchronise Shopify et Sheets | Conflit update, doublons |
| 40 | Agent qui génère un rapport ventes hebdo | Scheduling + livrable PDF absent |

### E. Admin / finance / juridique léger (41–50)

| # | Scénario | Risque |
|---|----------|--------|
| 41 | Agent qui classe des factures | Extraction montants fragile |
| 42 | Agent qui prépare un tableau de dépenses | Format CSV/XLSX absent |
| 43 | Agent qui détecte factures manquantes | Matching incomplet |
| 44 | Agent qui résume un contrat | Disclaimer / précision juridique |
| 45 | Agent qui compare clauses contractuelles | Citations nécessaires |
| 46 | Agent qui prépare un email de relance paiement | Envoi automatique risqué |
| 47 | Agent qui génère un rapport mensuel financier | Erreurs de calcul |
| 48 | Agent qui lit des emails de facturation | Mauvais label Gmail / mauvais compte |
| 49 | Agent qui crée une checklist conformité | Contexte légal variable |
| 50 | Agent qui prépare documents pour comptable | Livrables multiples à télécharger |

### F. Multi-connecteurs (51–60)

| # | Scénario | Risque |
|---|----------|--------|
| 51 | Agent Gmail + Sheets + Notion | Un connecteur connecté, pas les autres |
| 52 | Agent Slack + Jira + Google Drive | Permissions partielles |
| 53 | Agent Notion vers Linear | Mapping champs complexe |
| 54 | Agent Gmail vers Calendar | Création events doublons |
| 55 | Agent Calendar + email de compte-rendu | Timezone, invités, compte Gmail |
| 56 | Agent Drive + OpenAI + Slack | Gros fichiers, timeout |
| 57 | Agent Sheets + Stripe | Données sensibles, permissions |
| 58 | Agent Shopify + Gmail | Action auto sur mauvais compte |
| 59 | Agent CRM + Slack alert | Alerte envoyée trop tôt |
| 60 | Agent multi-user dans une équipe | Owner/connecteur mal résolu |

### G. Code / data processing (61–70)

| # | Scénario | Risque |
|---|----------|--------|
| 61 | Agent qui exécute du code Python sur CSV | Sandbox sécurité |
| 62 | Agent qui génère du SQL | SQL dangereux |
| 63 | Agent qui nettoie un dataset | Perte données, encoding |
| 64 | Agent qui produit un graphique | Fichier image non livré |
| 65 | Agent qui génère un dashboard HTML | Preview absente |
| 66 | Agent qui transforme JSON en CSV | Nested JSON mal aplati |
| 67 | Agent qui valide des emails | Regex insuffisante |
| 68 | Agent qui merge plusieurs fichiers | Collisions colonnes |
| 69 | Agent qui crée un fichier XLSX | Système livrable absent |
| 70 | Agent qui génère et zippe des fichiers | Stockage/download absent |

### H. Agents longs / live / livrables (71–80)

| # | Scénario | Risque |
|---|----------|--------|
| 71 | Agent de 3 minutes avec 10 étapes | User ne voit rien, pense que ça bug |
| 72 | Agent de 30 minutes | Heartbeat absent, run stale |
| 73 | Agent qui échoue à l'étape 7 | Impossible de reprendre |
| 74 | Agent avec 20 sous-actions | Logs illisibles |
| 75 | Agent qui produit 5 livrables | Un seul output texte supporté |
| 76 | Agent qui produit PDF + CSV | Pas de table deliverables |
| 77 | Agent qui doit notifier quand fini | Notification absente |
| 78 | Agent lancé deux fois par erreur | Doublons, crédits doublés |
| 79 | Agent qui tourne en background | Worker non lancé |
| 80 | Agent dont le worker crash | Run bloqué en running |

### I. Marketplace / billing / permissions (81–90)

| # | Scénario | Risque |
|---|----------|--------|
| 81 | User achète un prompt puis le créateur le supprime | Historique cassé si hard delete |
| 82 | User abonné à un agent veut se désabonner | Route cancel absente |
| 83 | Créateur supprime agent avec abonnés actifs | Abonnés perdent accès brutalement |
| 84 | User supprime un agent draft | Pas de bouton / route |
| 85 | User lance agent sans crédits | Run créé puis échoue mal |
| 86 | User est débité mais agent échoue | Crédits non release |
| 87 | User change de plan | Accès agent incohérent |
| 88 | User a plusieurs comptes connectés | Mauvais compte utilisé |
| 89 | Créateur modifie agent publié | Versioning absent |
| 90 | User veut télécharger ancien livrable | Livrable non stocké |

### J. Edge cases / sécurité / robustesse (91–100)

| # | Scénario | Risque |
|---|----------|--------|
| 91 | Variable `{{step_5_output}}` appelée à l'étape 2 | Référence future |
| 92 | Variable `{{customer.email}}` mal extraite | Builder demande mauvaise variable |
| 93 | Deux étapes ont le même outputKey | Écrasement données |
| 94 | Action sans paramètre obligatoire | Agent publié mais inutilisable |
| 95 | Prompt vide | Run inutile |
| 96 | Code vide | Run inutile |
| 97 | Retrieve sans query | Étape impossible |
| 98 | Document injecte une instruction malveillante | Prompt injection |
| 99 | Connecteur expiré | Agent tourne jamais |
| 100 | Rate limit API externe | Failed immédiat au lieu de retry |

---

## Bugs probables identifiés

### P0 — Critiques

| # | Bug | Scénarios |
|---|-----|-----------|
| 1 | Suppression listings/agents absente | 81, 83, 84 |
| 2 | Désabonnement agent absent | 82 |
| 3 | Runs async qui restent bloqués en `running` | 72, 79, 80 |
| 4 | Worker claim non atomique (doublons possibles) | 78, 79 |
| 5 | Pas de heartbeat fiable | 72, 80 |
| 6 | Reaper stale trop fragile | 72, 80 |
| 7 | Mauvais compte connecté possible | 5, 13, 48, 51, 55, 58, 88 |
| 8 | Builder peut publier des agents invalides | 94, 95, 96, 97 |
| 9 | Références d'étapes futures non bloquées | 91 |
| 10 | Pas de gestion des livrables téléchargeables | 20, 25, 40, 50, 64, 69, 70, 75, 76, 90 |

### P1 — Importants

| # | Bug | Scénarios |
|---|-----|-----------|
| 11 | Pas de reprise depuis une étape échouée | 73 |
| 12 | Pas de versioning agents publiés | 89 |
| 13 | Pas de validation forte des actions connecteurs | 14, 94 |
| 14 | Pas de preview livrable | 29, 65 |
| 15 | Logs live pas assez lisibles | 71, 74 |
| 16 | Pas de retry/backoff sur APIs externes | 100, 28 |
| 17 | Pas d'idempotence sur actions sensibles | 12, 15, 39, 54 |
| 18 | Pas de limitation claire coût/crédits avant lancement | 32, 85 |
| 19 | Pas de diagnostic connecteur avant run | 51, 99 |
| 20 | Pas de tests intégration multi-connecteurs | 51–60 |

### P2 — Qualité

| # | Bug | Scénarios |
|---|-----|-----------|
| 21 | Pas de templates de tests builder | — |
| 22 | Pas de scoring qualité agent avant publication | — |
| 23 | Dry-run ne simule pas les actions | 34, 46 |
| 24 | Pas de mode "test avec données fictives" | — |
| 25 | Pas de dashboard santé worker/admin | — |

---

## Corrections planifiées

Voir les sections P0/P1/P2 du sprint plan dans la TODO globale du projet.
