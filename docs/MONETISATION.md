# Grille tarifaire Prompta

## Hiérarchie des modèles

| Modèle | Pour qui | Comment on paie |
|--------|----------|-----------------|
| **Abonnement par agent + BYOK** | Utilisateurs réguliers d'un agent/workflow | Abonnement mensuel au créateur + clés API personnelles |
| **Achat unique** | Prompts et contenus one-shot | Paiement unique → accès permanent à la dernière version |
| **Crédits Prompta** | Utilisateurs non techniques sans clés | Coût calculé (tokens × tarif + marge) — voir `lib/billing/credits.ts` |
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

Le débit en crédits est calculé à partir du **coût réel** (tokens, outils, compute) avec marge plateforme — voir `lib/billing/credits.ts` et `lib/llm/pricing.ts`.
