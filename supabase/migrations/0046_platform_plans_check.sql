-- ============================================================
-- Migration 0046 — plans starter/pro/scale sur platform_subscriptions
-- La contrainte d'origine (0013) n'acceptait que 'pro' : tout abonnement
-- Starter ou Scale échouait au webhook Stripe. Découvert le 2026-07-07.
-- ============================================================

alter table platform_subscriptions
  drop constraint if exists platform_subscriptions_plan_check;

alter table platform_subscriptions
  add constraint platform_subscriptions_plan_check
  check (plan in ('starter', 'pro', 'scale'));
