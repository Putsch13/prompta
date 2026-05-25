-- ============================================================
-- Migration 0013 — Planification & Prompta Pro
-- ============================================================

create table scheduled_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  cron_expression text not null,
  inputs jsonb default '{}',
  notify_email boolean default true,
  active boolean default true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz default now()
);

create table platform_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  stripe_subscription_id text unique,
  plan text not null default 'pro' check (plan in ('pro')),
  status text not null default 'active',
  current_period_end timestamptz,
  created_at timestamptz default now(),
  unique (user_id)
);

alter table scheduled_runs enable row level security;
alter table platform_subscriptions enable row level security;

create policy "Users manage own scheduled runs"
  on scheduled_runs for all using (auth.uid() = user_id);

create policy "Users read own platform subscription"
  on platform_subscriptions for select using (auth.uid() = user_id);

create index idx_scheduled_runs_next on scheduled_runs(next_run_at) where active = true;
