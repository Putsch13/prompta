-- ============================================================
-- Vérification de l'état du schéma prod (lecture seule)
-- À lancer AVANT et APRÈS le script de rattrapage 0043.
-- Objectif APRÈS : les deux requêtes doivent renvoyer 0 ligne.
-- ============================================================

-- 1) Tables attendues mais absentes
with attendues(t) as (
  values
    ('user_credits'), ('credit_transactions'), ('org_audit_log'),
    ('platform_pro_usage'), ('platform_pro_revshare'),
    ('platform_run_economics'), ('platform_credit_guard'),
    ('agent_approvals'), ('agent_triggers'), ('agent_trigger_events'),
    ('agent_memories'), ('agent_knowledge_sources'), ('agent_knowledge_chunks')
)
select 'TABLE MANQUANTE' as probleme, t as objet
from attendues
where not exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = t
);

-- 2) Colonnes attendues mais absentes (tables existantes)
with attendues(tbl, col) as (
  values
    ('org_listings', 'content'), ('org_listings', 'approved_by'), ('org_listings', 'approved_at'),
    ('organizations', 'stripe_subscription_id'), ('organizations', 'subscription_status'),
    ('listing_agent_runs', 'version_id'), ('listing_agent_runs', 'inputs'),
    ('listing_agent_runs', 'used_credits'), ('listing_agent_runs', 'credit_hold_estimate_cents'),
    ('listing_agent_runs', 'paused_at_step'), ('listing_agent_runs', 'resume_from_step')
)
select 'COLONNE MANQUANTE' as probleme, tbl || '.' || col as objet
from attendues
where not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = tbl and column_name = col
);
