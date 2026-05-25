-- ============================================================
--  Prompta — Migration 0005 : Mode Sandbox
--  À exécuter APRÈS 0004.
--  Permet de tester les agents sans coût API et sans polluer
--  les données de production.
-- ============================================================

-- ────────────────────────────────────────────────────────────
--  1. Mode global sur le budget : 'sandbox' ou 'live'
-- ────────────────────────────────────────────────────────────
alter table agent_budget
  add column if not exists mode text not null default 'sandbox'
  check (mode in ('sandbox', 'live'));

-- Démarrage en SANDBOX par défaut = sécurité.
-- Tu passeras en 'live' depuis l'admin quand tu seras prêt.
update agent_budget set mode = 'sandbox' where id = 1;

-- ────────────────────────────────────────────────────────────
--  2. Marquage sandbox sur les runs et les outputs
-- ────────────────────────────────────────────────────────────
alter table agent_runs
  add column if not exists is_sandbox boolean not null default false;

alter table agent_outputs
  add column if not exists is_sandbox boolean not null default false;

create index if not exists agent_outputs_sandbox_idx
  on agent_outputs (is_sandbox, status);

-- ────────────────────────────────────────────────────────────
--  3. Fonction de purge : efface toutes les données sandbox
--     Appelée depuis l'admin via le bouton "Vider la sandbox".
-- ────────────────────────────────────────────────────────────
create or replace function public.purge_sandbox()
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Ne supprime QUE les données marquées sandbox
  delete from public.agent_logs
    where run_id in (select id from public.agent_runs where is_sandbox = true);
  delete from public.agent_outputs where is_sandbox = true;
  delete from public.agent_runs where is_sandbox = true;
end;
$$;

-- ────────────────────────────────────────────────────────────
--  4. Vue : compteurs sandbox pour l'admin
-- ────────────────────────────────────────────────────────────
create or replace view sandbox_summary as
select
  (select mode from agent_budget where id = 1)                          as current_mode,
  (select count(*) from agent_runs where is_sandbox = true)             as sandbox_runs,
  (select count(*) from agent_outputs where is_sandbox = true)          as sandbox_outputs,
  (select count(*) from agent_outputs
     where is_sandbox = true and status = 'pending')                    as sandbox_pending;
