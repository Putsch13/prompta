# Prompta — Business Plan (projection 24 mois)

*Rédigé le 6 juillet 2026, mis à jour le 16 juillet 2026 (recentrage assistant : moteur marketplace retiré, fuites de facturation colmatées — tac au tac, planification et replan désormais débités avec markup).*

## 1. Le modèle économique (3 moteurs de revenus)

| Moteur | Mécanique | Marge brute |
|---|---|---|
| **Abonnements plans** (Starter 19 € / Pro 49 € / Scale 149 €) | Quota d'agents gardés + crédits IA inclus | ~55-70 % au pire cas (crédits inclus = 10/30/100 €, coût API réel ≈ crédits ÷ 1,6) — **≥ 30 % garanti même à consommation 100 %** |
| **Crédits à la carte** | Recharges quand les crédits inclus sont épuisés | ~37 % (MARKUP ×1,6 sur le coût API, appliqué sur TOUS les chemins : missions, tac au tac, planification, replan, aiFills) |
| **BYOK** | Gratuit (aucune marge) — mais **c'est le moteur d'acquisition** : zéro friction, zéro coût variable pour nous | ∞ (coût nul) |

**Pourquoi ce mix fonctionne :** le freemium (1 agent gardé + 2 € offerts) fait entrer ; le BYOK retient les techniciens sans nous coûter ; les plans monétisent le confort (crédits inclus, quotas).

## 2. Économie unitaire

- **Coût d'un signup freemium** : 2 € de crédits offerts = **1,25 € de coût API réel maximum** (÷1,6), consommés par ~30 % des inscrits seulement → coût moyen réel ≈ **0,40 €/signup**.
- **Marge Starter** : 19 € − 6,25 € (10 € crédits ÷1,6, si consommés à 100 %) − ~0,55 € Stripe ≈ **12,2 € net (64 %)**. En pratique la consommation moyenne des crédits inclus est de 40-70 % → marge réelle 70-80 %.
- **Marge Pro** : 49 € − 18,75 € − 1 € ≈ **29 € net (60 %)** au pire cas.
- **Coûts fixes actuels** : Render (web + worker starter) ~15 €, Supabase Pro 24 €, Composio ~27 €, Resend/Sentry/PostHog free tiers → **≈ 70 €/mois**. Le point mort structurel est à **~5 abonnés Starter**.

## 3. Funnel d'acquisition (hypothèses)

SEO (pages tarifs/landing optimisées, FAQ structurée JSON-LD, pages cas d'usage indexées) + SEA FR sur requêtes intentionnistes (« créer un agent IA », « automatiser gmail sheets ia », CPC estimé 0,8-1,5 €).

| Étape | Taux | Base mois 6 |
|---|---|---|
| Visiteurs/mois | — | 6 000 (SEO 60 % / SEA 40 %) |
| → Inscription | 8 % | 480 |
| → Activation (1er agent testé) | 35 % | 168 |
| → Publication (freemium consommé) | 50 % des activés | 84 |
| → **Conversion payante** | 5 % des inscrits | **24 nouveaux payants/mois** |

CAC blended estimé : **8-12 €** (SEA pur ~19 €, SEO ~0 €). LTV Starter (churn 6 %/mois → 16 mois) ≈ **200 €**. **LTV/CAC ≈ 17-25×** — très sain, typique d'un produit à forte rétention par intégration (les agents en production ne se débranchent pas).

## 4. Projection MRR — 3 scénarios (24 mois)

Mix payant supposé : 60 % Starter / 32 % Pro / 8 % Scale → **ARPU ≈ 39 €**. Churn 6 %/mois. Crédits à la carte : +6 % du MRR.

| Mois | Prudent (MRR) | Central (MRR) | Ambitieux (MRR) |
|---|---|---|---|
| M3 | 350 € | 700 € | 1 400 € |
| M6 | 1 100 € | 2 300 € | 4 800 € |
| M12 | 3 400 € | 7 500 € | 16 000 € |
| M18 | 6 200 € | 14 500 € | 33 000 € |
| M24 | 9 500 € | **23 000 €** | 56 000 € |

- **Prudent** : 10 nouveaux payants/mois plafonnés, distribution ZIP uniquement (pas de Chrome Web Store).
- **Central** : Chrome Web Store en ligne + croissance acquisition +10 %/mois.
- **Ambitieux** : un canal qui sur-performe (SEO cas d'usage FR ou une verticale métier qui adopte — ex. praticiens santé).

**Break-even opérationnel** (coûts fixes + ~1 500 €/mois d'outillage/SEA) : **M7-M9 en scénario central**.

## 5. Les 5 leviers qui font basculer du prudent au central

1. **Chrome Web Store** : remplacer l'installation ZIP par « Ajouter à Chrome » (guide prêt : docs/CHROME-WEB-STORE.md) — le levier n°1, tout le funnel en dépend.
2. **Templates SEO** : une page indexable par cas d'usage (« agent qui lit tes factures Drive et remplit un Sheets ») → longue traîne massive, CAC ~0.
3. **Le moment magique < 10 min** : inscription → extension → première mission réelle (clarification, connexion Composio in-panel et reprise auto désormais en place).
4. **Upgrade path naturel** : le 2ᵉ agent gardé déclenche l'upgrade Starter (gate produit déjà en place).
5. **Crédits inclus consommés** : plus les agents tournent, plus la recharge à la carte tombe — aligné avec la valeur délivrée (tac au tac et planification désormais comptés).

## 6. Risques principaux & parades

| Risque | Parade |
|---|---|
| Baisse des prix API (marge crédits érodée) | La marge vient des plans (confort), pas des crédits ; MARKUP ajustable |
| Dépendance Composio | Connecteurs natifs de secours déjà en place (Gmail/Sheets/Slack OAuth direct) |
| Coût des runs freemium abusifs | Plafond 2 € one-shot + limites runtime + coupe-circuit plateforme déjà codés |
| Churn early-stage | Agents en production = intégration profonde ; notifications validation = réengagement |
