# Prompta — Business Plan (projection 24 mois)

*Rédigé le 6 juillet 2026 — hypothèses volontairement prudentes, à recaler chaque mois sur les chiffres réels.*

## 1. Le modèle économique (4 moteurs de revenus)

| Moteur | Mécanique | Marge brute |
|---|---|---|
| **Abonnements plans** (Starter 19 € / Pro 49 € / Scale 149 €) | Quota d'agents publiés + crédits IA inclus | ~55-70 % (crédits inclus = 10/30/100 €, coût API réel ≈ crédits ÷ 1,6) |
| **Crédits à la carte** | Recharges quand les crédits inclus sont épuisés | ~37 % (MARKUP ×1,6 sur le coût API) |
| **Commission marketplace** | 20 % sur les ventes/abonnements d'agents entre utilisateurs | ~95 % (net Stripe) |
| **BYOK** | Gratuit (aucune marge) — mais **c'est le moteur d'acquisition** : zéro friction, zéro coût variable pour nous | ∞ (coût nul) |

**Pourquoi ce mix fonctionne :** le freemium (1 agent publié + 2 € offerts) fait entrer ; le BYOK retient les techniciens sans nous coûter ; les plans monétisent le confort (crédits inclus, quotas) ; la marketplace crée l'effet réseau (les créateurs Pro amènent leurs abonnés).

## 2. Économie unitaire

- **Coût d'un signup freemium** : 2 € de crédits offerts = **1,25 € de coût API réel maximum** (÷1,6), consommés par ~30 % des inscrits seulement → coût moyen réel ≈ **0,40 €/signup**.
- **Marge Starter** : 19 € − 6,25 € (10 € crédits ÷1,6, si consommés à 100 %) − ~0,55 € Stripe ≈ **12,2 € net (64 %)**. En pratique la consommation moyenne des crédits inclus est de 40-70 % → marge réelle 70-80 %.
- **Marge Pro** : 49 € − 18,75 € − 1 € ≈ **29 € net (60 %)** au pire cas.
- **Coûts fixes actuels** : Render (web + worker starter) ~15 €, Supabase Pro 24 €, Composio ~27 €, Resend/Sentry/PostHog free tiers → **≈ 70 €/mois**. Le point mort structurel est à **~5 abonnés Starter**.

## 3. Funnel d'acquisition (hypothèses)

SEO (pages tarifs/landing optimisées, FAQ structurée JSON-LD, catégories marketplace indexées) + SEA FR sur requêtes intentionnistes (« créer un agent IA », « automatiser gmail sheets ia », CPC estimé 0,8-1,5 €).

| Étape | Taux | Base mois 6 |
|---|---|---|
| Visiteurs/mois | — | 6 000 (SEO 60 % / SEA 40 %) |
| → Inscription | 8 % | 480 |
| → Activation (1er agent testé) | 35 % | 168 |
| → Publication (freemium consommé) | 50 % des activés | 84 |
| → **Conversion payante** | 5 % des inscrits | **24 nouveaux payants/mois** |

CAC blended estimé : **8-12 €** (SEA pur ~19 €, SEO ~0 €). LTV Starter (churn 6 %/mois → 16 mois) ≈ **200 €**. **LTV/CAC ≈ 17-25×** — très sain, typique d'un produit à forte rétention par intégration (les agents en production ne se débranchent pas).

## 4. Projection MRR — 3 scénarios (24 mois)

Mix payant supposé : 60 % Starter / 32 % Pro / 8 % Scale → **ARPU ≈ 39 €**. Churn 6 %/mois. Marketplace : +8 % du MRR à partir du mois 9 (commission). Crédits à la carte : +6 % du MRR.

| Mois | Prudent (MRR) | Central (MRR) | Ambitieux (MRR) |
|---|---|---|---|
| M3 | 350 € | 700 € | 1 400 € |
| M6 | 1 100 € | 2 300 € | 4 800 € |
| M12 | 3 400 € | 7 500 € | 16 000 € |
| M18 | 6 200 € | 14 500 € | 33 000 € |
| M24 | 9 500 € | **23 000 €** | 56 000 € |

- **Prudent** : 10 nouveaux payants/mois plafonnés, pas de viralité marketplace.
- **Central** : croissance acquisition +10 %/mois, marketplace active M9.
- **Ambitieux** : un canal qui sur-performe (SEO catégories ou 2-3 créateurs marketplace à succès qui amènent leurs audiences).

**Break-even opérationnel** (coûts fixes + ~1 500 €/mois d'outillage/SEA) : **M7-M9 en scénario central**.

## 5. Les 5 leviers qui font basculer du prudent au central

1. **Templates SEO** : une page indexable par cas d'usage (« agent qui lit tes factures Drive et remplit un Sheets ») → longue traîne massive, CAC ~0.
2. **Le moment magique < 10 min** : inscription → agent qui fait quelque chose de réel (le funnel d'activation est LE multiplicateur, d'où l'investissement QA de ces derniers jours).
3. **Créateurs marketplace** : 10 créateurs Pro avec 20 abonnés chacun = 4 000 €/mois de GMV → 800 € de commission passive.
4. **Upgrade path naturel** : le 2ᵉ agent à publier déclenche l'upgrade Starter (gate produit déjà en place).
5. **Crédits inclus consommés** : plus les agents tournent, plus la recharge à la carte tombe — aligné avec la valeur délivrée.

## 6. Risques principaux & parades

| Risque | Parade |
|---|---|
| Baisse des prix API (marge crédits érodée) | La marge vient des plans (confort), pas des crédits ; MARKUP ajustable |
| Dépendance Composio | Connecteurs natifs de secours déjà en place (Gmail/Sheets/Slack OAuth direct) |
| Coût des runs freemium abusifs | Plafond 2 € one-shot + limites runtime + coupe-circuit plateforme déjà codés |
| Churn early-stage | Agents en production = intégration profonde ; notifications validation = réengagement |
