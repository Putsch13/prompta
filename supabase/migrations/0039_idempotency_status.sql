-- 0039 — Idempotence actions : statuts started/completed/failed

alter table agent_action_executions
  add column if not exists status text not null default 'completed'
    check (status in ('started', 'completed', 'failed')),
  add column if not exists error_message text,
  add column if not exists external_id text,
  add column if not exists updated_at timestamptz default now();

comment on column agent_action_executions.status is 'started = appel externe en cours, completed = résultat réutilisable, failed = échec sans double envoi';
comment on column agent_action_executions.external_id is 'ID retourné par le provider (message id, event id, etc.)';
