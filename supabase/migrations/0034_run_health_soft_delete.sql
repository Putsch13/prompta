-- 0034 — Santé des runs + soft delete listings
-- Ajoute les colonnes de monitoring des runs et supporte le soft-delete listings.

-- === Run health columns ===

alter table listing_agent_runs
  add column if not exists started_at timestamptz,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists claimed_by text;

create index if not exists idx_runs_status_heartbeat
  on listing_agent_runs(status, heartbeat_at)
  where status = 'running';

create index if not exists idx_runs_pending_created
  on listing_agent_runs(status, created_at)
  where status = 'pending';

comment on column listing_agent_runs.started_at is 'Timestamp du début réel d''exécution';
comment on column listing_agent_runs.heartbeat_at is 'Dernier heartbeat du worker, mis à jour pendant l''exécution';
comment on column listing_agent_runs.claimed_by is 'Identifiant du worker qui traite ce run';

-- === Soft delete listings ===
-- Étend le CHECK constraint pour autoriser deleted et archived.

alter table listings drop constraint if exists listings_status_check;

alter table listings add constraint listings_status_check
  check (status in (
    'draft',
    'under_review',
    'published',
    'rejected',
    'deleted',
    'archived'
  ));

create index if not exists idx_listings_not_deleted
  on listings(status)
  where status != 'deleted';
