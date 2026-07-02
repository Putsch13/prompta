-- 0045 — Répare le drift de contrainte de statut sur listing_agent_runs.
--
-- Constaté en prod le 2026-07-02 : l'ANCIENNE contrainte agent_runs_status_check
-- (sans 'awaiting_approval' ni 'cancelled') existe encore — la migration 0029
-- qui devait la remplacer n'a été que partiellement appliquée et le catchup
-- 0043 n'a pas couvert les contraintes. Conséquence : tout passage en
-- awaiting_approval/cancelled était REJETÉ (23514) silencieusement — les runs
-- en validation humaine restaient affichés « running ».
--
-- À exécuter dans Supabase → SQL Editor.

alter table listing_agent_runs drop constraint if exists agent_runs_status_check;
alter table listing_agent_runs drop constraint if exists listing_agent_runs_status_check;
alter table listing_agent_runs add constraint listing_agent_runs_status_check
  check (status in (
    'pending', 'running', 'completed', 'failed',
    'suspended', 'awaiting_approval', 'cancelled'
  ));

-- Vérification (doit renvoyer UNE ligne : listing_agent_runs_status_check)
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'listing_agent_runs'::regclass and contype = 'c';
