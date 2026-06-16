-- ============================================================
-- Migration 0043 — Rattrapage prod (réconciliation schéma)
-- ============================================================
-- Contexte : un audit a révélé que les migrations 0017, 0018, 0026 et 0029
-- n'ont été appliquées que PARTIELLEMENT en production. Tables et colonnes
-- manquantes → fonctionnalités cassées (validation humaine `agent_approvals`,
-- coupe-circuit coût `platform_credit_guard`, reprise de run, revshare Pro…).
--
-- Ce script est PUREMENT ADDITIF et 100% IDEMPOTENT :
--   - aucune suppression de données ni de colonne ;
--   - `if not exists` / garde `pg_policies` partout → réexécutable sans risque.
-- Il réconcilie la prod avec l'état voulu par les migrations 0017→0029.
-- ============================================================

begin;

-- ── 0017 : crédits plateforme, audit org, queue agent ───────────────────────

create table if not exists user_credits (
  user_id uuid primary key references profiles(id) on delete cascade,
  balance_cents int not null default 0 check (balance_cents >= 0),
  updated_at timestamptz default now()
);

create table if not exists credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  amount_cents int not null,
  kind text not null check (kind in ('purchase', 'run_debit', 'refund', 'bonus')),
  description text,
  run_id uuid references runs(id) on delete set null,
  stripe_session_id text,
  created_at timestamptz default now()
);

create table if not exists org_audit_log (
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

drop policy if exists "Users read own credits" on user_credits;
create policy "Users read own credits"
  on user_credits for select using (auth.uid() = user_id);

drop policy if exists "Users read own credit transactions" on credit_transactions;
create policy "Users read own credit transactions"
  on credit_transactions for select using (auth.uid() = user_id);

drop policy if exists "Org members read audit log" on org_audit_log;
create policy "Org members read audit log"
  on org_audit_log for select
  using (exists (
    select 1 from org_members where org_id = org_audit_log.org_id and user_id = auth.uid()
  ));

drop policy if exists "Org editors insert listings" on org_listings;
create policy "Org editors insert listings"
  on org_listings for insert
  with check (exists (
    select 1 from org_members
    where org_id = org_listings.org_id
      and user_id = auth.uid()
      and role in ('admin', 'editor')
  ));

drop policy if exists "Org admins update listings" on org_listings;
create policy "Org admins update listings"
  on org_listings for update
  using (exists (
    select 1 from org_members
    where org_id = org_listings.org_id
      and user_id = auth.uid()
      and role = 'admin'
  ));

drop policy if exists "Org editors update own pending" on org_listings;
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

create index if not exists idx_credit_tx_user on credit_transactions(user_id, created_at desc);
create index if not exists idx_org_audit_org on org_audit_log(org_id, created_at desc);
create index if not exists idx_listing_agent_runs_pending on listing_agent_runs(status, created_at)
  where status = 'pending';

-- ── 0018 : Prompta Pro — usage & revshare builders ──────────────────────────

create table if not exists platform_pro_usage (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  listing_id uuid not null references listings(id) on delete cascade,
  creator_id uuid not null references profiles(id) on delete cascade,
  run_count int not null default 0,
  updated_at timestamptz default now(),
  unique (period_month, listing_id)
);

create table if not exists platform_pro_revshare (
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

drop policy if exists "Creators read own pro usage" on platform_pro_usage;
create policy "Creators read own pro usage"
  on platform_pro_usage for select
  using (auth.uid() = creator_id);

drop policy if exists "Creators read own revshare" on platform_pro_revshare;
create policy "Creators read own revshare"
  on platform_pro_revshare for select
  using (auth.uid() = creator_id);

create index if not exists idx_pro_usage_period on platform_pro_usage(period_month, creator_id);
create index if not exists idx_pro_revshare_period on platform_pro_revshare(period_month, creator_id);

-- ── 0026 : suivi marge plateforme + coupe-circuit mode crédits ──────────────

create table if not exists platform_run_economics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  run_id uuid,
  run_type text not null check (run_type in ('prompt', 'agent')),
  actual_cost_cents numeric not null,
  billed_cents int not null,
  margin_cents int not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_run_economics_day
  on platform_run_economics(created_at desc);

create table if not exists platform_credit_guard (
  id int primary key default 1 check (id = 1),
  is_paused boolean not null default false,
  daily_cost_cents numeric not null default 0,
  daily_margin_cents numeric not null default 0,
  guard_day date not null default current_date,
  updated_at timestamptz not null default now()
);

insert into platform_credit_guard (id) values (1) on conflict (id) do nothing;

alter table listing_agent_runs
  add column if not exists used_credits boolean not null default false,
  add column if not exists credit_hold_estimate_cents numeric;

alter table platform_run_economics enable row level security;

drop policy if exists "Admins read platform economics" on platform_run_economics;
create policy "Admins read platform economics"
  on platform_run_economics for select
  using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

-- ── 0029 : approvals, triggers, mémoire agent ───────────────────────────────

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

drop policy if exists "Users read own approvals" on agent_approvals;
create policy "Users read own approvals"
  on agent_approvals for select
  using (
    exists (
      select 1 from listing_agent_runs r
      where r.id = agent_approvals.run_id and r.user_id = auth.uid()
    )
  );

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

alter table listing_agent_runs
  add column if not exists paused_at_step integer,
  add column if not exists resume_from_step integer;

-- Note : la contrainte de statut (incluant 'awaiting_approval' + 'cancelled')
-- est déjà correctement posée par 0042 en prod — on n'y touche pas ici.

commit;
