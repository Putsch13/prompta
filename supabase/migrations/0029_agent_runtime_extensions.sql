-- 0029 — Approvals, triggers, mémoire agent (Sprint 3)

-- Human-in-the-loop approvals
create table if not exists agent_approvals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references listing_agent_runs(id) on delete cascade,
  step_id text,
  step_index integer,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  payload jsonb not null default '{}',
  created_at timestamptz default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz
);

create index if not exists idx_agent_approvals_run on agent_approvals(run_id, status);

alter table agent_approvals enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'agent_approvals' and policyname = 'Users read own approvals'
  ) then
    create policy "Users read own approvals"
      on agent_approvals for select
      using (
        exists (
          select 1 from listing_agent_runs r
          where r.id = agent_approvals.run_id and r.user_id = auth.uid()
        )
      );
  end if;
end $$;

-- Triggers (manual / schedule / webhook)
create table if not exists agent_triggers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('manual', 'schedule', 'webhook', 'app_event')),
  config jsonb not null default '{}',
  enabled boolean not null default true,
  webhook_secret text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_agent_triggers_listing on agent_triggers(listing_id);
create index if not exists idx_agent_triggers_owner on agent_triggers(owner_id);

create table if not exists agent_trigger_events (
  id uuid primary key default gen_random_uuid(),
  trigger_id uuid not null references agent_triggers(id) on delete cascade,
  run_id uuid references listing_agent_runs(id) on delete set null,
  payload jsonb default '{}',
  created_at timestamptz default now()
);

-- Mémoire agent (MVP)
create table if not exists agent_memories (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid references listing_agent_runs(id) on delete set null,
  memory_type text not null default 'run' check (memory_type in ('run', 'agent', 'user', 'fact')),
  key text,
  content text not null,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists idx_agent_memories_listing on agent_memories(listing_id, user_id, created_at desc);

create table if not exists agent_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('file_upload', 'google_drive', 'notion', 'google_sheets', 'url', 'gmail', 'hubspot', 'custom_api')),
  label text,
  config jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists agent_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references agent_knowledge_sources(id) on delete cascade,
  content text not null,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists idx_knowledge_chunks_source on agent_knowledge_chunks(source_id);

-- Extend listing_agent_runs for approval pause
alter table listing_agent_runs
  add column if not exists paused_at_step integer,
  add column if not exists resume_from_step integer;

alter table listing_agent_runs drop constraint if exists agent_runs_status_check;
alter table listing_agent_runs add constraint listing_agent_runs_status_check
  check (status in ('pending', 'running', 'completed', 'failed', 'suspended', 'awaiting_approval'));
