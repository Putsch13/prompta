-- ============================================================
-- Migration 0049 — refonte pricing 3 offres + used_credits tri-state
--
-- 1) Plans : la refonte 2026-07-24 introduit l'id 'illimite' (29 €) et
--    conserve 'pro' (désormais 99 €). Les valeurs legacy 'starter'/'scale'
--    restent acceptées en base (lignes existantes + métadonnées Stripe des
--    abonnements souscrits avant la refonte) : elles sont normalisées à la
--    lecture par normalizePlanId, et leurs grants mensuels sont bornés par
--    1,22 × le montant payé (com ≥ 20 % garantie quel que soit le mapping).
--
-- 2) used_credits tri-state : le worker (process-pending-runs.ts) décide de
--    la facturation quand used_credits IS NULL (« run né hors API » :
--    extension/execute, cron tick, runs planifiés, webhook). Avec l'ancien
--    NOT NULL DEFAULT false, ces runs étaient vus comme « déjà autorisés par
--    l'API » → exécution sur clés plateforme SANS hold ni débit ni quota
--    gratuit. On rend la colonne nullable et sans défaut : l'API continue de
--    poser explicitement true/false, l'absence de valeur redevient « à
--    décider par le worker ».
-- ============================================================

alter table platform_subscriptions
  drop constraint if exists platform_subscriptions_plan_check;

alter table platform_subscriptions
  add constraint platform_subscriptions_plan_check
  check (plan in ('illimite', 'pro', 'starter', 'scale'));

alter table listing_agent_runs alter column used_credits drop not null;
alter table listing_agent_runs alter column used_credits drop default;
