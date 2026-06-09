-- 0042 — Annulation coopérative des runs agent (P0-2)
-- Ajoute le statut 'cancelled' aux checks runs/steps + colonnes de demande
-- d'annulation. L'orchestrateur lit cancel_requested entre les étapes.

-- 1) Runs : statut 'cancelled' + colonnes d'annulation
alter table listing_agent_runs drop constraint if exists listing_agent_runs_status_check;
alter table listing_agent_runs add constraint listing_agent_runs_status_check
  check (status in (
    'pending', 'running', 'completed', 'failed',
    'suspended', 'awaiting_approval', 'cancelled'
  ));

alter table listing_agent_runs
  add column if not exists cancel_requested boolean not null default false,
  add column if not exists cancelled_at timestamptz;

-- 2) Steps : statut 'cancelled'
alter table listing_agent_run_steps drop constraint if exists listing_agent_run_steps_status_check;
alter table listing_agent_run_steps add constraint listing_agent_run_steps_status_check
  check (status in ('pending', 'running', 'success', 'failed', 'skipped', 'cancelled'));

comment on column listing_agent_runs.cancel_requested is
  'Demande d''annulation coopérative — l''orchestrateur s''arrête à la prochaine étape.';
