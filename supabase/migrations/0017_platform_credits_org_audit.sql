-- ============================================================
-- Migration 0017 — Crédits plateforme, audit org, queue agent
-- ============================================================

create table user_credits (
  user_id uuid primary key references profiles(id) on delete cascade,
  balance_cents int not null default 0 check (balance_cents >= 0),
  updated_at timestamptz default now()
);

create table credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  amount_cents int not null,
  kind text not null check (kind in ('purchase', 'run_debit', 'refund', 'bonus')),
  description text,
  run_id uuid references runs(id) on delete set null,
  stripe_session_id text,
  created_at timestamptz default now()
);

create table org_audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  action text not null,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

alter table org_listings add column if not exists content jsonb default '{}';
alter table org_listings add column if not exists approved_by uuid references profiles(id);
alter table org_listings add column if not exists approved_at timestamptz;

alter table organizations add column if not exists stripe_subscription_id text;
alter table organizations add column if not exists subscription_status text default 'inactive'
  check (subscription_status in ('inactive', 'active', 'past_due', 'canceled'));

alter table listing_agent_runs add column if not exists version_id uuid references listing_versions(id) on delete set null;
alter table listing_agent_runs add column if not exists inputs jsonb default '{}';

alter table user_credits enable row level security;
alter table credit_transactions enable row level security;
alter table org_audit_log enable row level security;

create policy "Users read own credits"
  on user_credits for select using (auth.uid() = user_id);

create policy "Users read own credit transactions"
  on credit_transactions for select using (auth.uid() = user_id);

create policy "Org members read audit log"
  on org_audit_log for select
  using (exists (
    select 1 from org_members where org_id = org_audit_log.org_id and user_id = auth.uid()
  ));

create policy "Org editors insert listings"
  on org_listings for insert
  with check (exists (
    select 1 from org_members
    where org_id = org_listings.org_id
      and user_id = auth.uid()
      and role in ('admin', 'editor')
  ));

create policy "Org admins update listings"
  on org_listings for update
  using (exists (
    select 1 from org_members
    where org_id = org_listings.org_id
      and user_id = auth.uid()
      and role = 'admin'
  ));

create policy "Org editors update own pending"
  on org_listings for update
  using (
    status = 'pending_approval'
    and exists (
      select 1 from org_members
      where org_id = org_listings.org_id
        and user_id = auth.uid()
        and role in ('admin', 'editor')
    )
  );

create index idx_credit_tx_user on credit_transactions(user_id, created_at desc);
create index idx_org_audit_org on org_audit_log(org_id, created_at desc);
create index idx_listing_agent_runs_pending on listing_agent_runs(status, created_at)
  where status = 'pending';
