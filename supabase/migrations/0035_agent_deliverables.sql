-- 0035 — Livrables agent + idempotence actions
-- Tables pour stocker les fichiers produits par l'agent et garantir l'idempotence.

-- === agent_deliverables ===

create table if not exists agent_deliverables (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references listing_agent_runs(id) on delete cascade,
  listing_id uuid references listings(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'text',
  filename text not null,
  mime_type text not null default 'text/plain',
  storage_path text,
  content_text text,
  preview_text text,
  size_bytes integer default 0,
  created_at timestamptz default now()
);

create index if not exists idx_deliverables_run on agent_deliverables(run_id);
create index if not exists idx_deliverables_user on agent_deliverables(user_id, created_at desc);

alter table agent_deliverables enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'agent_deliverables'
      and policyname = 'Users read own deliverables'
  ) then
    create policy "Users read own deliverables"
      on agent_deliverables for select
      using (auth.uid() = user_id);
  end if;
end $$;

comment on table agent_deliverables is 'Fichiers et contenus produits par les runs agent';

-- === agent_action_executions (idempotence) ===

create table if not exists agent_action_executions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references listing_agent_runs(id) on delete cascade,
  step_index integer not null,
  action_slug text not null,
  execution_key text not null,
  result_output text,
  created_at timestamptz default now(),
  unique(run_id, execution_key)
);

create index if not exists idx_action_executions_run on agent_action_executions(run_id);

alter table agent_action_executions enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'agent_action_executions'
      and policyname = 'Users read own action executions'
  ) then
    create policy "Users read own action executions"
      on agent_action_executions for select
      using (
        exists (
          select 1 from listing_agent_runs r
          where r.id = agent_action_executions.run_id
            and r.user_id = auth.uid()
        )
      );
  end if;
end $$;

comment on table agent_action_executions is 'Registre d''exécution pour garantir l''idempotence des actions sensibles';
