-- ============================================================
-- Migration 0010 — Runs & quota gratuit
-- ============================================================

create table runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  listing_id uuid references listings(id) on delete set null,
  version_id uuid references listing_versions(id) on delete set null,
  model text,
  provider text,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  input_tokens int default 0,
  output_tokens int default 0,
  cost_estimate numeric(10, 6) default 0,
  output text,
  error_message text,
  created_at timestamptz default now()
);

create table free_run_quota (
  user_id uuid primary key references profiles(id) on delete cascade,
  runs_today int default 0,
  last_reset date default current_date
);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  listing_id uuid references listings(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'suspended')),
  steps_completed int default 0,
  max_steps int default 10,
  output jsonb,
  error_message text,
  created_at timestamptz default now()
);

alter table runs enable row level security;
alter table free_run_quota enable row level security;
alter table agent_runs enable row level security;

create policy "Users read own runs"
  on runs for select using (auth.uid() = user_id);

create policy "Users read own quota"
  on free_run_quota for select using (auth.uid() = user_id);

create policy "Users read own agent runs"
  on agent_runs for select using (auth.uid() = user_id);

create index idx_runs_user on runs(user_id, created_at desc);
create index idx_runs_listing on runs(listing_id);
