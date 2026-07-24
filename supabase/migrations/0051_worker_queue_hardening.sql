-- 0051 — Durcissement de la file worker (listing_agent_runs).
--
-- 1) queued_at : date de la DERNIÈRE (re)mise en pending. Le reaper des runs
--    pending se basait sur created_at → une reprise (post-approbation, replan,
--    resume auto) sur un run vieux de > 10 min était tuée et son hold libéré
--    avant même qu'un worker la prenne. queued_at est re-timestampé par le
--    code à chaque remise en pending ; DEFAULT now() couvre tous les inserts.
--    Le code garde un fallback created_at pour les lignes à queued_at null.
--
-- 2) Statut 'authorizing' : un run facturé en crédits naît désormais
--    NON-claimable tant que le hold n'est pas posé (l'API le bascule ensuite
--    en pending). Impossible de poser le hold avant l'insert : la transaction
--    de hold porte une FK credit_transactions.agent_run_id → listing_agent_runs.
--    Le reaper clôt les 'authorizing' orphelins (API morte entre insert et hold).
--
-- Idempotente — à exécuter dans Supabase → SQL Editor (cf. drift 0043/0045).

alter table listing_agent_runs
  add column if not exists queued_at timestamptz;

-- Backfill : seuls les runs encore en attente ont besoin d'une valeur — on
-- reprend created_at pour que les zombies existants restent réapables tout de
-- suite. L'historique (completed/failed…) reste à null, sans signification.
update listing_agent_runs
  set queued_at = coalesce(created_at, now())
  where queued_at is null and status = 'pending';

alter table listing_agent_runs
  alter column queued_at set default now();

-- Contrainte de statut : mêmes libellés que 0045 + 'authorizing'.
alter table listing_agent_runs drop constraint if exists agent_runs_status_check;
alter table listing_agent_runs drop constraint if exists listing_agent_runs_status_check;
alter table listing_agent_runs add constraint listing_agent_runs_status_check
  check (status in (
    'pending', 'running', 'completed', 'failed',
    'suspended', 'awaiting_approval', 'cancelled', 'authorizing'
  ));

-- Vérification (doit renvoyer UNE ligne : listing_agent_runs_status_check)
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'listing_agent_runs'::regclass and contype = 'c';
