-- Journal d'activité utilisateur (SCALE-3) + dry_run sur listing_agent_runs

alter table listing_agent_runs
  add column if not exists dry_run boolean not null default false;

create table if not exists user_run_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid references listing_agent_runs(id) on delete cascade,
  listing_id uuid references listings(id) on delete set null,
  action_type text not null check (action_type in ('llm', 'tool', 'action', 'code')),
  action_label text not null,
  detail jsonb default '{}',
  simulated boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_run_activity_user on user_run_activity(user_id, created_at desc);
create index if not exists idx_user_run_activity_run on user_run_activity(run_id);

alter table user_run_activity enable row level security;

drop policy if exists "Users read own run activity" on user_run_activity;
create policy "Users read own run activity"
  on user_run_activity for select
  using (auth.uid() = user_id);

-- Service role écrit depuis worker / API
drop policy if exists "Service insert run activity" on user_run_activity;
create policy "Service insert run activity"
  on user_run_activity for insert
  with check (true);
