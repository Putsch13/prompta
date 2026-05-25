-- ============================================================
-- Migration 0018 — Prompta Pro : usage & revshare builders
-- ============================================================

create table platform_pro_usage (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  listing_id uuid not null references listings(id) on delete cascade,
  creator_id uuid not null references profiles(id) on delete cascade,
  run_count int not null default 0,
  updated_at timestamptz default now(),
  unique (period_month, listing_id)
);

create table platform_pro_revshare (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  creator_id uuid not null references profiles(id) on delete cascade,
  listing_id uuid references listings(id) on delete set null,
  run_count int not null default 0,
  pool_cents int not null default 0,
  amount_cents int not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'skipped')),
  created_at timestamptz default now()
);

alter table platform_pro_usage enable row level security;
alter table platform_pro_revshare enable row level security;

create policy "Creators read own pro usage"
  on platform_pro_usage for select
  using (auth.uid() = creator_id);

create policy "Creators read own revshare"
  on platform_pro_revshare for select
  using (auth.uid() = creator_id);

create index idx_pro_usage_period on platform_pro_usage(period_month, creator_id);
create index idx_pro_revshare_period on platform_pro_revshare(period_month, creator_id);
