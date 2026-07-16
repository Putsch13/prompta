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
-- 3a. Assainissement préalable : la course (webhook rejoué / double requête)
--     a déjà produit des doublons en prod (ex. bonus de bienvenue crédité
--     deux fois). On garde la ligne la PLUS ANCIENNE de chaque groupe, on
--     supprime les autres, et on retranche le trop-crédité du solde (plancher
--     à 0 si les crédits ont déjà été dépensés).
with dups as (
  select id, user_id, amount_cents,
         row_number() over (
           partition by stripe_session_id, kind
           order by created_at asc, id asc
         ) as rn
  from credit_transactions
  where stripe_session_id is not null
),
removed as (
  delete from credit_transactions
  where id in (select id from dups where rn > 1)
  returning user_id, amount_cents
),
overcredit as (
  select user_id, sum(amount_cents) as total
  from removed
  where amount_cents > 0
  group by user_id
)
update user_credits uc
set balance_cents = greatest(0, uc.balance_cents - o.total),
    updated_at = now()
from overcredit o
where uc.user_id = o.user_id;

-- Un même checkout ne peut créditer qu'une fois (par type de transaction).
create unique index if not exists uq_credit_tx_stripe_session_kind
  on credit_transactions (stripe_session_id, kind)
  where stripe_session_id is not null;

-- 3b. Achats : même assainissement (doublons de webhook checkout.session.completed),
--     puis index unique. On garde l'achat le plus ancien.
delete from purchases p
using purchases keep
where p.stripe_checkout_session is not null
  and keep.stripe_checkout_session = p.stripe_checkout_session
  and (keep.created_at < p.created_at
       or (keep.created_at = p.created_at and keep.id < p.id));

-- Une même session checkout ne peut créer qu'un seul achat.
create unique index if not exists uq_purchases_checkout_session
  on purchases (stripe_checkout_session)
  where stripe_checkout_session is not null;
