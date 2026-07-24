# Prompta — Business Plan (projection 24 mois)

*Rédigé le 6 juillet 2026. Mise à jour majeure le 24 juillet 2026 : **refonte en 3 offres** (Découverte / Illimité 29 € / Pro 99 €) avec invariant de rentabilité codé — com ≥ 20 % du montant payé même à consommation 100 % des crédits.*

## 1. Le modèle économique (3 offres + 2 moteurs annexes)

| Offre | Prix | Ce qu'elle contient | Rôle dans le funnel |
|---|---|---|---|
| **Découverte** | 0 € | 2 € de crédits offerts (sans carte), 1 agent gardé, tous les modèles, BYOK illimité | Fait entrer — coût max 1,25 €/signup |
| **Illimité** ⭐ | 29 €/mois | **35 € de crédits IA/mois** (GPT, Claude, Gemini, Mistral), **agents gardés illimités** | L'offre par défaut de l'usage quotidien |
| **Pro** | 99 €/mois | **120 € de crédits/mois**, **multi-desk 10 postes**, plafond anti-abus 240 €, support prioritaire + accompagnement | Monétise l'intensité ; au-delà : sur devis |

Moteurs annexes : **recharges à la carte** (5/12/30/100 €, bonus jusqu'à +20 %) et **BYOK** (gratuit, zéro marge — mais zéro coût variable : c'est le moteur d'acquisition et de rétention des techniciens).

**Le pitch pricing** : « 35 € de crédits pour 29 € » — les crédits inclus dépassent le prix de l'abonnement. Deux mécanismes le permettent, et aucun n'est un cadeau : (1) les crédits sont valorisés au **tarif catalogue**, qui porte déjà le markup ×1,6 — 35 € de crédits ne représentent que 21,88 € de coût API réel ; (2) ils sont **non reportables**, donc le non-consommé retourne à la marge. L'abonné perçoit ~20 % de valeur en plus qu'à la recharge, la plateforme garde ≥ 20 % de marge nette même s'il consomme tout.

## 2. Économie unitaire — l'invariant « com ≥ 20 % »

Tout appel LLM sur clé plateforme est débité avec **markup ×1,6** (`lib/billing/credits.ts`, appliqué sur tous les chemins : missions, tac au tac, planification, replan, aiFills). Donc 1 € de crédits consommé coûte au plus **0,625 €** d'API.

**Plafond structurel** (`MAX_CREDIT_GRANT_RATIO = 1,22`, `lib/billing/plans.ts`) : on n'accorde jamais plus de **1,22 € de crédits par euro réellement payé**. Le webhook Stripe borne chaque grant mensuel par `1,22 × invoice.amount_paid` — factures legacy (anciens plans Starter 19 €/Pro 49 €/Scale 149 €), prorata de changement de plan et coupons compris. Aucune facture ne peut être déficitaire. Vérifié par `tests/unit/plans.test.ts`.

Marges **au pire cas** (crédits consommés à 100 %, frais Stripe EU 1,5 % + 0,25 €) :

| Plan | Payé | Coût API max | Stripe | Marge nette pire cas | Marge réelle attendue (conso 40-70 %) |
|---|---|---|---|---|---|
| Illimité | 29 € | 21,88 € | 0,69 € | **6,44 € (22 %)** | 14-19 € (50-65 %) |
| Pro | 99 € | 75,00 € | 1,74 € | **22,27 € (22 %)** | 50-65 € (50-65 %) |

- **Recharges à la carte** : ratio crédits/payé ≤ 1,2 sur tous les packs → marge ≥ 20 % garantie, ~24-37 % typique.
- **Coût d'un signup freemium** : 2 € offerts = 1,25 € de coût API max, consommés par ~30 % des inscrits → coût moyen réel ≈ **0,40 €/signup**.
- **Coûts fixes actuels** : Render (web + worker) ~15 €, Supabase Pro 24 €, Composio ~27 €, Resend/Sentry/Plausible free tiers → **≈ 70 €/mois**. Point mort structurel : **11 abonnés Illimité au pire cas, ~5 en consommation réelle**.
- **Crédits inclus NON reportables** (décision 2026-07-24) : l'allocation est remplacée à chaque facture, pas additionnée. C'est ce qui autorise à inclure plus de crédits que le prix du plan — le non-consommé (30 à 60 % en moyenne) retourne à la marge au lieu de s'accumuler en dette latente. Les recharges achetées à la carte, elles, n'expirent jamais et ne sont entamées qu'après l'allocation du mois : le client ne perd jamais un crédit qu'il a payé à l'unité.

## 3. Funnel d'acquisition (hypothèses)

SEO (pages tarifs/landing optimisées, FAQ structurée JSON-LD, pages cas d'usage indexées) + SEA FR sur requêtes intentionnistes (« créer un agent IA », « automatiser gmail sheets ia », CPC estimé 0,8-1,5 €).

| Étape | Taux | Base mois 6 |
|---|---|---|
| Visiteurs/mois | — | 6 000 (SEO 60 % / SEA 40 %) |
| → Inscription | 8 % | 480 |
| → Activation (1ʳᵉ mission testée) | 35 % | 168 |
| → 2ᵉ agent gardé voulu (gate freemium) | 50 % des activés | 84 |
| → **Conversion payante** | 5 % des inscrits | **24 nouveaux payants/mois** |

CAC blended estimé : **8-12 €** (SEA pur ~19 €, SEO ~0 €). LTV Illimité (churn 6 %/mois → ~16 mois) ≈ **460 € de revenu, ~230 € de marge**. **LTV(marge)/CAC ≈ 20-28×** — très sain : les agents en production ne se débranchent pas.

## 4. Projection MRR — 3 scénarios (24 mois)

Mix payant supposé : **80 % Illimité / 20 % Pro → ARPU ≈ 43 €** (vs 39 € dans l'ancienne grille : moins de paliers, panier moyen plus haut). Churn 6 %/mois. Recharges à la carte : +6 % du MRR.

| Mois | Prudent (MRR) | Central (MRR) | Ambitieux (MRR) |
|---|---|---|---|
| M3 | 400 € | 800 € | 1 600 € |
| M6 | 1 200 € | 2 500 € | 5 300 € |
| M12 | 3 700 € | 8 300 € | 17 500 € |
| M18 | 6 800 € | 16 000 € | 36 000 € |
| M24 | 10 500 € | **25 000 €** | 62 000 € |

- **Prudent** : 10 nouveaux payants/mois plafonnés, distribution ZIP uniquement (pas de Chrome Web Store).
- **Central** : Chrome Web Store en ligne + croissance acquisition +10 %/mois.
- **Ambitieux** : un canal qui sur-performe (SEO cas d'usage FR ou une verticale métier qui adopte — ex. praticiens santé).

**Break-even opérationnel** (coûts fixes + ~1 500 €/mois d'outillage/SEA) : **M7-M9 en scénario central**.

## 5. Les 5 leviers qui font basculer du prudent au central

1. **Chrome Web Store** : remplacer l'installation ZIP par « Ajouter à Chrome » (guide prêt : docs/CHROME-WEB-STORE.md) — le levier n°1, tout le funnel en dépend.
2. **Templates SEO** : une page indexable par cas d'usage (« agent qui lit tes factures Drive et remplit un Sheets ») → longue traîne massive, CAC ~0.
3. **Le moment magique < 10 min** : inscription → extension → première mission réelle (clarification, connexion Composio in-panel et reprise auto désormais en place).
4. **Upgrade path naturel** : le **2ᵉ agent gardé** déclenche l'upgrade vers Illimité (gate produit en place) — un seul palier à franchir, à 29 €, avec plus de crédits que le prix.
5. **Crédits inclus consommés** : plus les agents tournent, plus la recharge à la carte tombe — aligné avec la valeur délivrée (tac au tac et planification comptés).

## 6. Migration depuis l'ancienne grille (Starter 19 € / Pro 49 € / Scale 149 €)

- Les abonnés existants **gardent leur prix Stripe** ; leur valeur `plan` en base est normalisée : `starter` → Illimité, `scale` → Pro, ancien `pro` → Pro (`normalizePlanId`).
- Leur grant mensuel est **automatiquement borné à 1,22 × ce qu'ils paient** : un Starter legacy à 19 € reçoit 23,18 € de crédits/mois (pas 35 €), un Pro legacy à 49 € reçoit 59,78 € (pas 120 €) — chaque facture legacy reste à ≥ 20 % de marge sans action manuelle.
- Multi-desk Pro : engagement commercial (**10 postes** sur un même compte) ; le verrouillage technique des sièges est en roadmap — v1 : fair-use. Le risque de partage abusif est borné par le plafond de dépense mensuel (240 €) et par le fait que les postes partagent un solde unique.

## 7. Risques principaux & parades

| Risque | Parade |
|---|---|
| Baisse des prix API (marge crédits érodée) | La marge vient des plans (confort), pas des crédits ; MARKUP ajustable en un point |
| Un abonné brûle 100 % de ses crédits chaque mois | Cas couvert par construction : com ≥ 20 % au pire cas (invariant 1,22, testé) |
| Dépendance Composio | Connecteurs natifs de secours déjà en place (Gmail/Sheets/Slack OAuth direct) |
| Coût des runs freemium abusifs | Plafond 2 € one-shot + quota journalier + limites runtime + circuit-breaker plateforme |
| Churn early-stage | Agents en production = intégration profonde ; notifications de validation = réengagement |
| Non-report perçu comme punitif | L'allocation dépasse le prix payé (35 € pour 29 €) et les recharges achetées, elles, n'expirent jamais — la règle est annoncée en clair dans la FAQ tarifs |
