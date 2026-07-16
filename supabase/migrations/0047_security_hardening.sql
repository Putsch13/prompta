-- Durcissement sécurité (audit juillet 2026)
--
-- 1) RLS manquant sur des tables sensibles : sans RLS, une table exposée aux
--    rôles anon/authenticated est lisible/modifiable selon les GRANT par
--    défaut. Tout l'accès applicatif à ces tables passe par le service_role
--    (qui bypasse le RLS) : on active un deny-all (RLS sans policy).
-- 2) Policy INSERT ouverte sur user_run_activity : le service_role bypasse le
--    RLS, la policy ne servait qu'à ouvrir l'insert aux clients JWT (pollution
--    d'activité avec un user_id arbitraire).
-- 3) Idempotence billing : contraintes d'unicité pour fermer les courses des
--    webhooks Stripe (double crédit / double achat sur retry concurrent).

-- ── 1. RLS deny-all sur les tables service-only ─────────────────────────────
alter table if exists org_api_keys enable row level security;
alter table if exists agent_triggers enable row level security;
alter table if exists agent_trigger_events enable row level security;
alter table if exists agent_memories enable row level security;
alter table if exists agent_knowledge_sources enable row level security;
alter table if exists agent_knowledge_chunks enable row level security;
alter table if exists platform_credit_guard enable row level security;

-- ── 2. Fermer l'insert client sur le journal d'activité ─────────────────────
drop policy if exists "Service insert run activity" on user_run_activity;

-- ── 3. Idempotence Stripe ────────────────────────────────────────────────────
-- Un même checkout ne peut créditer qu'une fois (par type de transaction).
create unique index if not exists uq_credit_tx_stripe_session_kind
  on credit_transactions (stripe_session_id, kind)
  where stripe_session_id is not null;

-- Une même session checkout ne peut créer qu'un seul achat.
create unique index if not exists uq_purchases_checkout_session
  on purchases (stripe_checkout_session)
  where stripe_checkout_session is not null;
