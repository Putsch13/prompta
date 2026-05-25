# Grille tarifaire Prompta

## Hiérarchie des modèles

| Modèle | Pour qui | Comment on paie |
|--------|----------|-----------------|
| **Abonnement par agent + BYOK** | Utilisateurs réguliers d'un agent/workflow | Abonnement mensuel au créateur + clés API personnelles |
| **Achat unique** | Prompts et contenus one-shot | Paiement unique → accès permanent à la dernière version |
| **Crédits Prompta** | Utilisateurs non techniques sans clés | Forfait **0,10 € / run** (`RUN_CREDIT_COST_CENTS = 10`) — clé plateforme |
| **Prompta Pro** | Power users | Abonnement plateforme → runs via clés Prompta sans débit crédits |
| **Organisation (B2B)** | Équipes | Abonnement org + sièges |

## Règle anti double-facturation

Un utilisateur **abonné**, **acheteur** ou **Prompta Pro** lance en **BYOK sans débit de crédits**.  
S'il n'a pas de clé personnelle, la clé plateforme est utilisée **gratuitement** pour les utilisateurs ayant un droit d'accès.

Seuls les utilisateurs **sans accès** (listing gratuit) ou **sans clé ni droit** consomment des crédits ou le quota gratuit (20 runs/jour).

## Commission créateur

- **Ventes & abonnements agents** : Prompta prélève **20 %** (`PLATFORM_COMMISSION_PERCENT`).
- Le créateur touche **80 %** du prix affiché.

## Coût crédits

Le forfait **0,10 € / run** est un **prix d'appel simplifié** (non basé sur tokens/outils en V1).  
Documenté explicitement pour éviter toute ambiguïté.
